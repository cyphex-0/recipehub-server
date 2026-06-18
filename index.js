require('dns').setServers(['8.8.8.8'])
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { toNodeHandler } = require('better-auth/node')
const { port, clientUrl } = require('./src/config')
const { connect } = require('./src/config/db')
const { getAuth } = require('./src/lib/auth')


let dbReady = false
const isDbReady = () => {
  try {
    const { getDb } = require('./src/config/db')
    getDb()
    dbReady = true
    return true
  } catch {
    dbReady = false
    return false
  }
}


process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.message ? reason.message : reason)
})

const app = express()



app.use(
  cors({
    origin: [clientUrl, 'http://localhost:5173'],
    credentials: true,
  })
)
app.use(cookieParser())









app.use('/api/auth', (req, res, next) => {
  try {
    
    
    if (!req.app.locals.authHandler) {
      req.app.locals.authHandler = toNodeHandler(getAuth())
    }
    return req.app.locals.authHandler(req, res, next)
  } catch (err) {
    return res.status(503).json({ message: err.message || 'Auth unavailable' })
  }
})


app.use((req, res, next) => {
  if (req.originalUrl === '/payments/webhook') return next()
  return express.json({ limit: '2mb' })(req, res, next)
})


app.get('/', (req, res) =>
  res.json({
    ok: true,
    service: 'recipehub-server',
    db: isDbReady() ? 'connected' : 'not connected',
  })
)


app.use((req, res, next) => {
  if (req.originalUrl === '/' || req.originalUrl === '/payments/webhook') return next()
  if (!isDbReady()) {
    return res.status(503).json({
      message:
        'Database is not connected. Set MONGODB_URI in recipehub-server/.env to a real Atlas connection string and restart the server.',
    })
  }
  next()
})


app.use('/auth', require('./src/routes/auth'))
app.use('/users', require('./src/routes/users'))
app.use('/recipes', require('./src/routes/recipes'))
app.use('/favorites', require('./src/routes/favorites'))
app.use('/reports', require('./src/routes/reports'))
app.use('/payments', require('./src/routes/payments'))
app.use('/admin', require('./src/routes/admin'))


app.use((req, res) => res.status(404).json({ message: 'Not found' }))


app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({
    message: err.message || 'Server error',
  })
})

const start = async () => {
  
  
  
  app.listen(port, () =>
    console.log(`RecipeHub server listening on :${port}`)
  )

  try {
    await connect()
    dbReady = true
    console.log('MongoDB connected')
  } catch (err) {
    console.warn(
      `Warning: database connection failed (${err.message}). ` +
        `Server is up but data routes will error until MongoDB is configured.`
    )
  }
}

start()