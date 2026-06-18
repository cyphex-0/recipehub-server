const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const { getDb } = require('../config/db')
const verifyJWT = require('../middlewares/verifyAuth')

const router = express.Router()


router.use(verifyJWT)


router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getDb().collection('users').findOne({ email: req.user.email })
    if (!user) return res.status(404).json({ message: 'User not found' })
    const { password, ...safe } = user
    res.json(safe)
  })
)



router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const { name, image, coverPhoto } = req.body || {}
    const update = {}
    if (name)                    update.name  = name
    if (image !== undefined)     update.image = image
    if (coverPhoto !== undefined) update.coverPhoto = coverPhoto
    if (Object.keys(update).length === 0)
      return res.status(400).json({ message: 'Nothing to update' })

    await getDb()
      .collection('users')
      .updateOne({ email: req.user.email }, { $set: update })
    const user = await getDb().collection('users').findOne({ email: req.user.email })
    const { password, ...safe } = user
    res.json(safe)
  })
)


router.get(
  '/me/stats',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const [recipeCount, favoritesCount, purchasedCount, likesAgg] = await Promise.all([
      db.collection('recipes').countDocuments({ authorEmail: req.user.email }),
      db.collection('favorites').countDocuments({ userEmail: req.user.email }),
      db.collection('payments').countDocuments({ userEmail: req.user.email }),
      db
        .collection('recipes')
        .aggregate([
          { $match: { authorEmail: req.user.email } },
          { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$likes', []] } } } } },
        ])
        .toArray(),
    ])
    res.json({
      recipeCount,
      favoritesCount,
      purchasedCount,
      totalLikes: likesAgg[0]?.total || 0,
    })
  })
)


router.get(
  '/me/purchases',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const ids = await db
      .collection('payments')
      .find({ userEmail: req.user.email })
      .project({ recipeId: 1 })
      .toArray()
    if (ids.length === 0) return res.json([])
    const oids = ids.map((p) => p.recipeId).filter((x) => x)
    const { toClientList } = require('../lib/serializeRecipe')
    const recipes = await db
      .collection('recipes')
      .find({ _id: { $in: oids } })
      .toArray()
    res.json(toClientList(recipes))
  })
)

module.exports = router