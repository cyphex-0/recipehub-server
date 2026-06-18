const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const { getDb } = require('../config/db')
const requireAuth = require('../middlewares/verifyAuth')

const router = express.Router()


router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb()
    
    
    const user = await db.collection('users').findOne({ email: req.user.email })
    if (!user) {
      return res.json({
        _id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        photoURL: req.user.photoURL,
        role: req.user.role,
        isPremium: req.user.isPremium,
      })
    }
    const { password, passwordHash, ...safe } = user
    res.json(safe)
  })
)

module.exports = router