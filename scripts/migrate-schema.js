

require('dotenv').config()
const { MongoClient } = require('mongodb')

async function migrate() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI is not set in .env')
    process.exit(1)
  }

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  console.log('\n✔ Connected to MongoDB. Starting migration…\n')

  

  
  const recipesRename = await db.collection('recipes').updateMany(
    {},
    {
      $rename: {
        name:         'recipeName',
        image:        'recipeImage',
        cuisine:      'cuisineType',
        difficulty:   'difficultyLevel',
        prepTime:     'preparationTime',
        likeCount:    'likesCount',
        creatorEmail: 'authorEmail',
        creatorName:  'authorName',
        creatorPhoto: 'authorPhoto',
      },
    }
  )
  console.log(`  recipes  — field rename:        ${recipesRename.modifiedCount} docs`)

  
  const recipesNeedingAuthorId = await db
    .collection('recipes')
    .find({ authorId: { $exists: false } })
    .toArray()

  let authorIdFixed = 0
  for (const recipe of recipesNeedingAuthorId) {
    if (!recipe.authorEmail) continue
    const user = await db.collection('users').findOne({ email: recipe.authorEmail })
    if (user) {
      await db.collection('recipes').updateOne(
        { _id: recipe._id },
        { $set: { authorId: user.id || String(user._id) } }
      )
      authorIdFixed++
    }
  }
  console.log(`  recipes  — authorId backfill:   ${authorIdFixed} docs`)

  

  
  const favRename = await db.collection('favorites').updateMany(
    { createdAt: { $exists: true } },
    { $rename: { createdAt: 'addedAt' } }
  )
  console.log(`  favorites — addedAt rename:     ${favRename.modifiedCount} docs`)

  
  const favsNeedingUserId = await db
    .collection('favorites')
    .find({ userId: { $exists: false } })
    .toArray()

  let favUserIdFixed = 0
  for (const fav of favsNeedingUserId) {
    if (!fav.userEmail) continue
    const user = await db.collection('users').findOne({ email: fav.userEmail })
    if (user) {
      await db.collection('favorites').updateOne(
        { _id: fav._id },
        { $set: { userId: user.id || String(user._id) } }
      )
      favUserIdFixed++
    }
  }
  console.log(`  favorites — userId backfill:    ${favUserIdFixed} docs`)

  

  const paysNeedingUserId = await db
    .collection('payments')
    .find({ userId: { $exists: false } })
    .toArray()

  let payUserIdFixed = 0
  for (const pay of paysNeedingUserId) {
    if (!pay.userEmail) continue
    const user = await db.collection('users').findOne({ email: pay.userEmail })
    if (user) {
      await db.collection('payments').updateOne(
        { _id: pay._id },
        { $set: { userId: user.id || String(user._id) } }
      )
      payUserIdFixed++
    }
  }
  console.log(`  payments  — userId backfill:    ${payUserIdFixed} docs`)

  

  
  const usersNeedingImage = await db.collection('users').updateMany(
    { photoURL: { $exists: true }, image: { $exists: false } },
    [{ $set: { image: '$photoURL' } }]
  )
  console.log(`  users     — image backfill:     ${usersNeedingImage.modifiedCount} docs`)

  
  const usersPhotoURLRemoved = await db.collection('users').updateMany(
    { photoURL: { $exists: true } },
    { $unset: { photoURL: '' } }
  )
  console.log(`  users     — photoURL removed:   ${usersPhotoURLRemoved.modifiedCount} docs`)

  console.log('\n✔ Migration complete.\n')
  await client.close()
}

migrate().catch((err) => {
  console.error('\n✘ Migration failed:', err.message)
  process.exit(1)
})
