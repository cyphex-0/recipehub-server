const dotenv = require('dotenv')
dotenv.config()

module.exports = {
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    premiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
}
