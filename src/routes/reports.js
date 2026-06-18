const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const { getDb, toOid } = require('../config/db')
const verifyJWT = require('../middlewares/verifyAuth')

const router = express.Router()


router.post(
  '/',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const { recipeId, reason } = req.body || {}
    if (!recipeId || !reason)
      return res.status(400).json({ message: 'recipeId and reason required' })
    const oid = toOid(recipeId)
    if (!oid) return res.status(400).json({ message: 'Invalid recipeId' })
    const recipe = await getDb().collection('recipes').findOne({ _id: oid })
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' })

    const doc = {
      recipeId: oid,
      recipeName:    recipe.recipeName  || recipe.name  || '',
      recipeImage:   recipe.recipeImage || recipe.image || '',
      reporterEmail: req.user.email,
      reporterName: req.user.name || req.user.email,
      reason: String(reason).slice(0, 500),
      description: req.body.details ? String(req.body.details).slice(0, 1000) : '',
      status: 'pending',
      createdAt: new Date(),
    }
    await getDb().collection('reports').insertOne(doc)
    res.status(201).json({ message: 'Report submitted' })
  })
)

module.exports = router
