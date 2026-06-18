const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const { getDb, toOid } = require('../config/db')
const verifyJWT = require('../middlewares/verifyAuth')

const router = express.Router()
router.use(verifyJWT)


router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const items = await db
      .collection('favorites')
      .find({ userEmail: req.user.email })
      .sort({ addedAt: -1 })
      .toArray()
    if (items.length === 0) return res.json([])
    const oids = items.map((f) => f.recipeId).filter((x) => x)
    const recipes = await db
      .collection('recipes')
      .find({ _id: { $in: oids } })
      .toArray()
    
    const { toClientList } = require('../lib/serializeRecipe')
    const map = new Map(recipes.map((r) => [String(r._id), r]))
    const ordered = oids.map((o) => map.get(String(o))).filter(Boolean)
    res.json(toClientList(ordered))
  })
)


router.post(
  '/:recipeId',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.recipeId)
    if (!oid) return res.status(400).json({ message: 'Invalid recipe id' })
    const db = getDb()
    const exists = await db.collection('recipes').findOne({ _id: oid })
    if (!exists) return res.status(404).json({ message: 'Recipe not found' })
    const existing = await db
      .collection('favorites')
      .findOne({ userEmail: req.user.email, recipeId: oid })
    if (existing) return res.status(409).json({ message: 'Already favorited' })
    await db.collection('favorites').insertOne({
      userEmail: req.user.email,
      userId:    req.user.id,
      recipeId:  oid,
      addedAt:   new Date(),
    })
    res.status(201).json({ message: 'Favorited' })
  })
)


router.delete(
  '/:recipeId',
  asyncHandler(async (req, res) => {
    const oid = toOid(req.params.recipeId)
    if (!oid) return res.status(400).json({ message: 'Invalid recipe id' })
    await getDb()
      .collection('favorites')
      .deleteOne({ userEmail: req.user.email, recipeId: oid })
    res.json({ message: 'Removed' })
  })
)

module.exports = router
