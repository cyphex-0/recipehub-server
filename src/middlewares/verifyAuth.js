







const { getAuth } = require('../lib/auth')
const { getDb } = require('../config/db')

const requireAuth = async (req, res, next) => {
  try {
    const session = await getAuth().api.getSession({
      headers: req.headers,
    })
    if (!session || !session.user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
    req.user = {
      id:        session.user.id,
      email:     session.user.email,
      name:      session.user.name,
      image:     session.user.image || '',
      role:      'user',
      isPremium: false,
      isBlocked: false,
    }

    
    
    
    
    try {
      const dbUser = await getDb()
        .collection('users')
        .findOne({ email: session.user.email })
      if (dbUser) {
        if (dbUser.role)  req.user.role      = dbUser.role
        req.user.isPremium  = !!dbUser.isPremium
        req.user.isBlocked  = !!dbUser.isBlocked
        
        
        if (dbUser.name)  req.user.name  = dbUser.name
        
        if (dbUser.image) req.user.image = dbUser.image
      } else {
        
        req.user.role = session.user.role || 'user'
        req.user.isPremium = !!session.user.isPremium
      }
    } catch {
      
      req.user.role = session.user.role || 'user'
      req.user.isPremium = !!session.user.isPremium
    }

    if (req.user.isBlocked) {
      return res.status(403).json({ message: 'Account blocked' })
    }

    req.session = session.session
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid session' })
  }
}

module.exports = requireAuth
