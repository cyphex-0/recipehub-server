const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const { getDb, toOid, ObjectId } = require('../config/db')
const verifyJWT = require('../middlewares/verifyAuth')
const {
  toClient,
  toClientList,
  fromClient,
  specSortToMongo,
  oidEquals,
} = require('../lib/serializeRecipe')

const router = express.Router()


const SORT_OPTIONS = {
  newest:           { createdAt: -1 },
  '-createdAt':     { createdAt: -1 },
  'top-rated':      { rating: -1, createdAt: -1 },
  '-averageRating': { rating: -1, createdAt: -1 },
  'most-liked':     { likesCount: -1, createdAt: -1 },
  '-likes':         { likesCount: -1, createdAt: -1 },
  quickest:         { preparationTime: 1, createdAt: -1 },
  prepTime:         { preparationTime: 1, createdAt: -1 },
  name:             { recipeName: 1 },
}

const buildFilter = (q) => {
  const filter = {}
  if (q.search) {
    const re = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    
    filter.$or = [{ recipeName: re }, { cuisineType: re }, { category: re }]
  }
  if (q.category && q.category !== 'all') {
    
    const cats = String(q.category).split(',').map((c) => c.trim()).filter(Boolean)
    filter.category = cats.length > 1 ? { $in: cats } : cats[0]
  }
  if (q.authorEmail) filter.authorEmail = q.authorEmail
  if (q.featured === 'true') filter.isFeatured = true
  return filter
}


router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 9))
    
    
    const sort =
      specSortToMongo(req.query.sort) ||
      SORT_OPTIONS[req.query.sort] ||
      SORT_OPTIONS.newest

    const filter = buildFilter(req.query)
    const total = await db.collection('recipes').countDocuments(filter)
    const recipes = await db
      .collection('recipes')
      .find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    res.json({
      recipes: toClientList(recipes),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  })
)


router.get(
  '/me',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const db = getDb()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
    const skip = (page - 1) * limit

    const filter = { authorEmail: req.user.email }
    const [recipes, total] = await Promise.all([
      db.collection('recipes')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('recipes').countDocuments(filter)
    ])

    res.json({
      recipes: toClientList(recipes),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit))
    })
  })
)


router.get(
  '/featured',
  asyncHandler(async (req, res) => {
    const recipes = await getDb()
      .collection('recipes')
      .find({ isFeatured: true })
      .sort({ rating: -1, likesCount: -1, createdAt: -1 })
      .limit(6)
      .toArray()
    res.json(toClientList(recipes))
  })
)




router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const db = getDb()
    const recipe = await db.collection('recipes').findOne({ _id: oid })
    if (!recipe) return res.status(404).json({ message: 'Not found' })

    const out = toClient(recipe)

    
    if (req.headers.cookie || req.headers.authorization) {
      try {
        const { getAuth } = require('../lib/auth')
        const session = await getAuth().api.getSession({ headers: req.headers })
        if (session?.user?.email) {
          const purchase = await db
            .collection('payments')
            .findOne({ userEmail: session.user.email, recipeId: oid })
          out.isPurchased = !!purchase
        }
      } catch {
        out.isPurchased = false
      }
    } else {
      out.isPurchased = false
    }
    res.json(out)
  })
)


router.post(
  '/',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const db = getDb()
    const me = await db.collection('users').findOne({ email: req.user.email })
    if (!me) return res.status(404).json({ message: 'User missing' })

    
    if (!me.isPremium) {
      const count = await db.collection('recipes').countDocuments({ authorEmail: me.email })
      if (count >= 2)
        return res.status(403).json({ message: 'Free tier limit reached (2 recipes). Upgrade to Premium.' })
    }

    
    
    const fields = fromClient(req.body || {})
    const { recipeName, recipeImage, category } = fields
    if (!recipeName || !recipeImage || !category)
      return res.status(400).json({ message: 'Missing fields' })

    const doc = {
      ...fields,
      cuisineType:     fields.cuisineType     || 'Other',
      difficultyLevel: fields.difficultyLevel || 'easy',
      preparationTime: fields.preparationTime || 30,
      servings:        fields.servings        || 2,
      ingredients:     Array.isArray(fields.ingredients)  ? fields.ingredients  : [],
      instructions:    Array.isArray(fields.instructions) ? fields.instructions : [],
      price:           fields.price     || 0,
      isPremium:       !!fields.isPremium,
      isFeatured:      false,
      likes:           [],
      likesCount:      0,
      rating:          0,
      ratingCount:     0,
      ratings:         [],
      status:          fields.status || 'published',
      authorId:        req.user.id,
      authorEmail:     me.email,
      authorName:      me.name,
      authorPhoto:     me.image || '',
      createdAt:       new Date(),
    }
    const r = await db.collection('recipes').insertOne(doc)
    doc._id = r.insertedId
    res.status(201).json(toClient(doc))
  })
)


router.put(
  '/:id',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const db = getDb()
    const existing = await db.collection('recipes').findOne({ _id: oid })
    if (!existing) return res.status(404).json({ message: 'Not found' })
    if (existing.authorEmail !== req.user.email && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' })

    
    const fields = fromClient(req.body || {})
    const allowed = [
      'recipeName', 'recipeImage', 'category', 'cuisineType', 'difficultyLevel',
      'preparationTime', 'ingredients', 'instructions', 'price', 'isPremium',
      'servings', 'status',
    ]
    const update = {}
    for (const k of allowed) {
      if (fields[k] !== undefined) update[k] = fields[k]
    }
    if (update.price !== undefined)           update.price           = Number(update.price) || 0
    if (update.preparationTime !== undefined) update.preparationTime = Number(update.preparationTime) || 30
    update.updatedAt = new Date()
    await db.collection('recipes').updateOne({ _id: oid }, { $set: update })
    const after = await db.collection('recipes').findOne({ _id: oid })
    res.json(toClient(after))
  })
)


router.delete(
  '/:id',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const db = getDb()
    const existing = await db.collection('recipes').findOne({ _id: oid })
    if (!existing) return res.status(404).json({ message: 'Not found' })
    if (existing.authorEmail !== req.user.email && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' })
    await db.collection('recipes').deleteOne({ _id: oid })
    
    await db.collection('favorites').deleteMany({ recipeId: oid })
    res.json({ message: 'Deleted' })
  })
)


router.post(
  '/:id/like',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const db = getDb()
    const recipe = await db.collection('recipes').findOne({ _id: oid })
    if (!recipe) return res.status(404).json({ message: 'Not found' })
    const likes = Array.isArray(recipe.likes) ? recipe.likes : []
    const idx = likes.indexOf(req.user.email)
    if (idx === -1) likes.push(req.user.email)
    else likes.splice(idx, 1)
    await db.collection('recipes').updateOne(
      { _id: oid },
      { $set: { likes, likesCount: likes.length } }
    )
    res.json({ liked: idx === -1, likesCount: likes.length })
  })
)


router.post(
  '/:id/rate',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const rating = Math.max(1, Math.min(5, Number(req.body?.rating)))
    const db = getDb()
    const recipe = await db.collection('recipes').findOne({ _id: oid })
    if (!recipe) return res.status(404).json({ message: 'Not found' })
    const ratings = Array.isArray(recipe.ratings) ? recipe.ratings : []
    const existing = ratings.find((r) => r.email === req.user.email)
    if (existing) existing.value = rating
    else ratings.push({ email: req.user.email, value: rating })
    const sum = ratings.reduce((s, r) => s + r.value, 0)
    const avg = ratings.length ? +(sum / ratings.length).toFixed(2) : 0
    await db.collection('recipes').updateOne(
      { _id: oid },
      { $set: { ratings, rating: avg, ratingCount: ratings.length } }
    )
    res.json({ averageRating: avg, ratingsCount: ratings.length })
  })
)

module.exports = router
