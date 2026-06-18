require('dotenv').config();
const { MongoClient } = require('mongodb');

async function fixImages() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    
    
    const recipes = await db.collection('recipes').find({}).toArray();
    console.log("Current images:");
    recipes.forEach(r => console.log(r.recipeImage));
    
    
    const res = await db.collection('recipes').updateMany(
      { recipeImage: { $regex: /ibb\.co|imgbb/i } },
      { $set: { recipeImage: 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=600' } }
    );
    console.log('Updated broken imgbb image links:', res.modifiedCount);
    
    
    const res2 = await db.collection('recipes').updateMany(
      { image: { $regex: /ibb\.co|imgbb/i } },
      { $set: { image: 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=600' } }
    );
    console.log('Updated legacy broken image links:', res2.modifiedCount);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

fixImages();
