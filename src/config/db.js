const { MongoClient, ObjectId } = require('mongodb')
const dns = require('dns').promises

let _client = null
let _db = null

const buildUri = () => {
  return process.env.MONGODB_URI || `mongodb://localhost:27017/recipehub`
}

const resolveSrvAndBuildUri = async (srvUri) => {
  
  const m = srvUri.match(/^mongodb\+srv:\/\/([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/)
  if (!m) return null
  const auth = m[1]
  const host = m[2]
  const dbPath = m[3] || ''
  const opts = m[4] || ''
  let records
  try {
    records = await dns.resolveSrv(`_mongodb._tcp.${host}`)
  } catch {
    return null
  }
  if (!records || records.length === 0) return null
  // Drop port=27017 (default); otherwise include it.
  const hosts = records
    .map((r) => `${r.name}:${r.port}`)
    .join(',')
  return `mongodb://${auth}@${hosts}${dbPath}${opts}`
}

const connect = async () => {
  if (_db) return _db
  let uri = buildUri()
  if (!uri) {
    throw new Error(
      'No MongoDB connection configured. Set MONGODB_URI in recipehub-server/.env.'
    )
  }

  // If we're using an srv:
  
  if (uri.startsWith('mongodb+srv://')) {
    try {
      _client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      })
      await _client.connect()
    } catch (err) {
      const looksLikeSrv = /querySrv|SRV/i.test(err.message || '')
      if (!looksLikeSrv) throw err
      const fallback = await resolveSrvAndBuildUri(uri)
      if (!fallback) throw err
      console.warn(
        '[db] SRV lookup failed, falling back to direct shard hosts:',
        fallback.replace(/\/\/[^@]+@/, '//***@')
      )
      _client = new MongoClient(fallback, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      })
      await _client.connect()
      uri = fallback
    }
  } else {
    _client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    })
    await _client.connect()
  }

  _db = _client.db() 

  
  Promise.all([
    _db.collection('recipes').createIndex({ authorEmail: 1 }),
    _db.collection('recipes').createIndex({ isFeatured: 1 }),
    _db.collection('favorites').createIndex({ userEmail: 1 }),
    _db.collection('payments').createIndex({ userEmail: 1 }),
    _db.collection('users').createIndex({ isPremium: 1 }),
  ]).catch(err => console.error('[db] Failed to create indexes:', err))

  return _db
}

const getDb = () => {
  if (!_db) throw new Error('DB not connected. Call connect() first.')
  return _db
}

const toOid = (id) => {
  try {
    return new ObjectId(id)
  } catch {
    return null
  }
}

module.exports = { connect, getDb, toOid, ObjectId }
