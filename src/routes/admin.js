const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const { getDb, toOid } = require('../config/db')
const verifyJWT = require('../middlewares/verifyAuth')
const verifyAdmin = require('../middlewares/verifyAdmin')

const router = express.Router()
router.use(verifyJWT, verifyAdmin)

const safeUser = ({ password, ...rest }) => rest


router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const [totalUsers, totalRecipes, pendingReports, premiumUsers, revenueAgg, topRecipesArr] =
      await Promise.all([
        db.collection('users').countDocuments({}),
        db.collection('recipes').countDocuments({}),
        db.collection('reports').countDocuments({ status: 'pending' }),
        db.collection('users').countDocuments({ isPremium: true }),
        db
          .collection('payments')
          .aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
          .toArray(),
        db
          .collection('recipes')
          .find({})
          .sort({ likesCount: -1, rating: -1 })
          .limit(5)
          .toArray(),
      ])

    
    const topRecipes = topRecipesArr.map((r) => ({
      _id:          r._id,
      recipeName:   r.recipeName   || r.name  || '',
      recipeImage:  r.recipeImage  || r.image || '',
      category:     r.category,
      authorName:   r.authorName   || r.creatorName  || r.authorEmail || 'Unknown',
      likesCount:   r.likesCount   || r.likeCount     || 0,
      averageRating: r.rating      || 0,
    }))

    
    const [latestRecipes, latestReports] = await Promise.all([
      db.collection('recipes').find({}).sort({ createdAt: -1 }).limit(3).toArray(),
      db.collection('reports').find({}).sort({ createdAt: -1 }).limit(3).toArray(),
    ])
    const recentActivity = [
      ...latestRecipes.map((r) => ({
        text: `New recipe "${r.recipeName || r.name}" by ${r.authorName || r.creatorName || r.authorEmail || r.creatorEmail}`,
        at: r.createdAt,
      })),
      ...latestReports.map((r) => ({
        text: `Report on "${r.recipeName || 'a recipe'}" — ${r.reason}`,
        at: r.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 6)

    res.json({
      totalUsers,
      totalRecipes,
      premiumUsers,
      pendingReports,
      totalRevenue: revenueAgg[0]?.total || 0,
      topRecipes,
      recentActivity,
    })
  })
)


router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const search = req.query.search
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
    const skip = (page - 1) * limit

    const filter = {}
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: re }, { email: re }]
    }

    const [users, total] = await Promise.all([
      db.collection('users').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('users').countDocuments(filter),
    ])

    res.json({
      users: users.map(safeUser),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  })
)


router.patch(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const role = req.body?.role
    if (!['user', 'admin'].includes(role))
      return res.status(400).json({ message: 'Invalid role' })
      
    const target = await getDb().collection('users').findOne({ _id: oid })
    if (target?.email === req.user.email) {
      return res.status(403).json({ message: 'Cannot modify your own role' })
    }
    await getDb()
      .collection('users')
      .updateOne({ _id: oid }, { $set: { role } })
    res.json({ message: 'Role updated' })
  })
)


router.patch(
  '/users/:id/premium',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    
    const target = await getDb().collection('users').findOne({ _id: oid })
    if (target?.email === req.user.email) {
      return res.status(403).json({ message: 'Cannot modify your own premium status' })
    }
    
    const isPremium = !!req.body?.isPremium
    await getDb()
      .collection('users')
      .updateOne({ _id: oid }, { $set: { isPremium } })
    res.json({ message: 'Premium status updated' })
  })
)


router.patch(
  '/users/:id/block',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    
    const target = await getDb().collection('users').findOne({ _id: oid })
    if (target?.email === req.user.email) {
      return res.status(403).json({ message: 'Cannot block your own account' })
    }
    
    const isBlocked = !!req.body?.isBlocked
    await getDb()
      .collection('users')
      .updateOne({ _id: oid }, { $set: { isBlocked } })
    res.json({ message: isBlocked ? 'User blocked' : 'User unblocked' })
  })
)


router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const user = await getDb().collection('users').findOne({ _id: oid })
    if (!user) return res.status(404).json({ message: 'Not found' })
    if (user.email === req.user.email) {
      return res.status(403).json({ message: 'Cannot delete your own account' })
    }
    if (user.role === 'admin')
      return res.status(403).json({ message: 'Cannot delete admin' })
    await getDb().collection('users').deleteOne({ _id: oid })
    res.json({ message: 'User deleted' })
  })
)


router.get(
  '/recipes',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
    const skip = (page - 1) * limit

    const filter = {}
    if (req.query.search) {
      const re = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      
      filter.$or = [{ recipeName: re }, { authorEmail: re }]
    }

    const [recipes, total] = await Promise.all([
      db.collection('recipes').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('recipes').countDocuments(filter),
    ])

    const { toClientList } = require('../lib/serializeRecipe')
    res.json({
      recipes: toClientList(recipes),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  })
)


router.delete(
  '/recipes/:id',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    await getDb().collection('recipes').deleteOne({ _id: oid })
    res.json({ message: 'Recipe deleted' })
  })
)


router.patch(
  '/recipes/:id/feature',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const isFeatured = !!req.body?.isFeatured
    await getDb()
      .collection('recipes')
      .updateOne({ _id: oid }, { $set: { isFeatured } })
    res.json({ message: isFeatured ? 'Recipe featured' : 'Recipe unfeatured' })
  })
)


router.patch(
  '/recipes/:id/status',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const status = req.body?.status
    const allowed = ['published', 'draft', 'archived']
    if (!allowed.includes(status))
      return res
        .status(400)
        .json({ message: `Invalid status. Use one of: ${allowed.join(', ')}` })
    const r = await getDb()
      .collection('recipes')
      .updateOne({ _id: oid }, { $set: { status, updatedAt: new Date() } })
    if (r.matchedCount === 0)
      return res.status(404).json({ message: 'Recipe not found' })
    res.json({ message: `Recipe status set to ${status}` })
  })
)


router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const status = req.query.status || 'pending'
    const filter = {}
    if (['pending', 'resolved', 'dismissed'].includes(status)) {
      filter.status = status
    }
    const reports = await db
      .collection('reports')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray()
    res.json(reports)
  })
)


router.patch(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const oid = toOid(req.params.id)
    if (!oid) return res.status(400).json({ message: 'Invalid id' })
    const action = req.body?.action
    if (!['dismiss', 'remove'].includes(action))
      return res.status(400).json({ message: 'Invalid action. Use "dismiss" or "remove".' })

    if (action === 'dismiss') {
      await db
        .collection('reports')
        .updateOne({ _id: oid }, { $set: { status: 'dismissed', updatedAt: new Date() } })
      return res.json({ message: 'Report dismissed' })
    }

    
    const report = await db.collection('reports').findOne({ _id: oid })
    if (report?.recipeId) {
      await db.collection('recipes').deleteOne({ _id: report.recipeId })
    }
    await db
      .collection('reports')
      .updateOne({ _id: oid }, { $set: { status: 'resolved', updatedAt: new Date() } })
    res.json({ message: 'Recipe removed and report resolved' })
  })
)


router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15))
    const skip = (page - 1) * limit

    const [transactions, total, revenueAgg, recipeCount, premiumCount] = await Promise.all([
      db.collection('payments').aggregate([
        { $sort: { paidAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $lookup: { from: 'users', localField: 'userEmail', foreignField: 'email', as: 'userDocs' } }
      ]).toArray(),
      db.collection('payments').countDocuments({}),
      db.collection('payments').aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).toArray(),
      db.collection('payments').countDocuments({ type: 'recipe' }),
      db.collection('payments').countDocuments({ type: 'premium' }),
    ])

    res.json({
      transactions: transactions.map((t) => {
        const userDoc = t.userDocs && t.userDocs[0];
        const userName = userDoc ? userDoc.name : t.userEmail;
        const { userDocs, ...cleanT } = t;
        return {
          ...cleanT,
          userName,
          userEmail: t.userEmail,
          status: t.paymentStatus || 'completed',
        }
      }),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      totalRevenue: revenueAgg[0]?.total || 0,
      recipeCount,
      premiumCount,
    })
  })
)

module.exports = router