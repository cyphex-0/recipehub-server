








const { betterAuth } = require('better-auth')
const { mongodbAdapter } = require('better-auth/adapters/mongodb')
const { getDb } = require('../config/db')

const buildAuth = () => {
  const db = getDb()
  return betterAuth({
    appName: 'RecipeHub',
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',

    
    database: mongodbAdapter(db),

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      
      
      minPasswordLength: 6,
      maxPasswordLength: 128,
    },

    user: {
      modelName: 'users',
      
      
      
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'user',
          input: false, 
        },
        isPremium: {
          type: 'boolean',
          defaultValue: false,
          input: false,
        },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,        
      updateAge: 60 * 60 * 24,             
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      
      
      useSecureCookies: process.env.NODE_ENV === 'production',
      defaultCookieAttributes: {
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
      },
    },

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },

    trustedOrigins: [
      process.env.CLIENT_URL || 'http://localhost:5173',
    ],
  })
}


let _auth = null
const getAuth = () => {
  if (!_auth) _auth = buildAuth()
  return _auth
}

module.exports = { getAuth }
