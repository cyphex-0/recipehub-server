const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const Stripe = require('stripe')
const { getDb, toOid } = require('../config/db')
const { stripe: stripeCfg } = require('../config')
const verifyJWT = require('../middlewares/verifyAuth')

const router = express.Router()

const stripe = stripeCfg.secretKey
  ? new Stripe(stripeCfg.secretKey, { apiVersion: '2024-12-18.acacia' })
  : null

const FRONTEND = process.env.CLIENT_URL || 'http://localhost:5173'


router.post(
  '/checkout',
  verifyJWT,
  asyncHandler(async (req, res) => {
    if (!stripe) return res.status(500).json({ message: 'Stripe not configured' })
    const oid = toOid(req.body?.recipeId)
    if (!oid) return res.status(400).json({ message: 'Invalid recipeId' })
    const recipe = await getDb().collection('recipes').findOne({ _id: oid })
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' })
    if (!recipe.isPremium)
      return res.status(400).json({ message: 'Recipe is not premium' })

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round((recipe.price || 0) * 100),
            product_data: { name: recipe.recipeName },
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND}/payment/success?session_id={CHECKOUT_SESSION_ID}&recipeId=${oid}`,
      cancel_url: `${FRONTEND}/recipe/${oid}?cancelled=1`,
      metadata: {
        type:      'recipe',
        recipeId:  String(oid),
        userEmail: req.user.email,
        userId:    req.user.id,
      },
    })
    res.json({ url: session.url, id: session.id })
  })
)


router.post(
  '/premium-checkout',
  verifyJWT,
  asyncHandler(async (req, res) => {
    if (!stripe) return res.status(500).json({ message: 'Stripe not configured' })
    const priceId = req.body?.priceId || stripeCfg.premiumPriceId
    if (!priceId)
      return res.status(500).json({ message: 'STRIPE_PREMIUM_PRICE_ID not set' })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=premium`,
      cancel_url: `${FRONTEND}/dashboard/profile?cancelled=1`,
      metadata: {
        type:      'premium',
        userEmail: req.user.email,
        userId:    req.user.id,
      },
    })
    res.json({ url: session.url, id: session.id })
  })
)


router.post(
  '/verify',
  verifyJWT,
  asyncHandler(async (req, res) => {
    if (!stripe) return res.status(500).json({ message: 'Stripe not configured' })
    const sessionId = req.query.session_id || req.body?.session_id
    if (!sessionId) return res.status(400).json({ message: 'session_id required' })
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid' && session.mode !== 'subscription')
      return res.status(402).json({ message: 'Payment not completed' })

    const meta = session.metadata || {}
    const db = getDb()
    if (meta.type === 'recipe' && meta.recipeId) {
      const oid = toOid(meta.recipeId)
      if (oid) {
        await db.collection('payments').updateOne(
          { userEmail: req.user.email, recipeId: oid },
          {
            $set: {
              userEmail:     req.user.email,
              userId:        req.user.id,
              recipeId:      oid,
              amount:        session.amount_total ? session.amount_total / 100 : 0,
              transactionId: session.id,
              paymentStatus: 'completed',
              stripeSession: session.id,
              type:          'recipe',
              paidAt:        new Date(),
            },
          },
          { upsert: true }
        )
        return res.json({ ok: true, type: 'recipe', recipeId: meta.recipeId })
      }
    }
    if (meta.type === 'premium') {
      const until = new Date()
      until.setMonth(until.getMonth() + 1)
      await db
        .collection('users')
        .updateOne(
          { email: req.user.email },
          { $set: { isPremium: true, premiumUntil: until } }
        )
      
      await db.collection('payments').updateOne(
        { stripeSession: session.id },
        {
          $set: {
            userEmail:     req.user.email,
            userId:        req.user.id,
            amount:        session.amount_total ? session.amount_total / 100 : 0,
            transactionId: session.id,
            paymentStatus: 'completed',
            stripeSession: session.id,
            type:          'premium',
            paidAt:        new Date(),
          },
        },
        { upsert: true }
      )
      return res.json({ ok: true, type: 'premium' })
    }
    res.json({ ok: true, session })
  })
)


router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    if (!stripe) return res.status(500).end()
    const sig = req.headers['stripe-signature']
    let event
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, stripeCfg.webhookSecret)
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const meta = session.metadata || {}
      const db = getDb()
      if (meta.type === 'recipe' && meta.recipeId) {
        const oid = toOid(meta.recipeId)
        if (oid) {
          await db.collection('payments').updateOne(
            { stripeSession: session.id },
            {
              $set: {
                userEmail:     meta.userEmail,
                userId:        meta.userId || '',
                recipeId:      oid,
                amount:        session.amount_total ? session.amount_total / 100 : 0,
                transactionId: session.id,
                paymentStatus: 'completed',
                stripeSession: session.id,
                type:          'recipe',
                paidAt:        new Date(),
              },
            },
            { upsert: true }
          )
        }
      } else if (meta.type === 'premium' && meta.userEmail) {
        const until = new Date()
        until.setMonth(until.getMonth() + 1)
        await db
          .collection('users')
          .updateOne(
            { email: meta.userEmail },
            { $set: { isPremium: true, premiumUntil: until } }
          )
        
        await db.collection('payments').updateOne(
          { stripeSession: session.id },
          {
            $set: {
              userEmail:     meta.userEmail,
              userId:        meta.userId || '',
              amount:        session.amount_total ? session.amount_total / 100 : 0,
              transactionId: session.id,
              paymentStatus: 'completed',
              stripeSession: session.id,
              type:          'premium',
              paidAt:        new Date(),
            },
          },
          { upsert: true }
        )
      }
    }
    res.json({ received: true })
  })
)

module.exports = router