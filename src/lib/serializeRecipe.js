













const toClient = (doc) => {
  if (!doc) return null
  const o = { ...doc }

  
  o.recipeName      = doc.recipeName      ?? doc.name         ?? ''
  o.recipeImage     = doc.recipeImage     ?? doc.image        ?? ''
  o.cuisineType     = doc.cuisineType     ?? doc.cuisine      ?? ''
  o.difficultyLevel = doc.difficultyLevel ?? doc.difficulty   ?? ''
  o.preparationTime = doc.preparationTime ?? doc.prepTime     ?? 0
  o.likesCount      = doc.likesCount      ?? doc.likeCount    ?? 0
  o.averageRating   = doc.rating                              ?? 0
  o.ratingsCount    = doc.ratingCount                         ?? 0
  o.authorId        = doc.authorId                            ?? ''
  o.authorEmail     = doc.authorEmail     ?? doc.creatorEmail ?? ''
  o.authorName      = doc.authorName      ?? doc.creatorName  ?? ''
  o.authorPhoto     = doc.authorPhoto     ?? doc.creatorPhoto ?? ''
  o.status          = doc.status                              || 'published'

  return o
}


const toClientList = (docs) => docs.map(toClient)




const fromClient = (input = {}) => {
  const out = {}

  if (input.recipeName !== undefined)      out.recipeName      = input.recipeName
  else if (input.name !== undefined)       out.recipeName      = input.name

  if (input.recipeImage !== undefined)     out.recipeImage     = input.recipeImage
  else if (input.image !== undefined)      out.recipeImage     = input.image

  if (input.cuisineType !== undefined)     out.cuisineType     = input.cuisineType
  else if (input.cuisine !== undefined)    out.cuisineType     = input.cuisine

  if (input.difficultyLevel !== undefined) out.difficultyLevel = input.difficultyLevel
  else if (input.difficulty !== undefined) out.difficultyLevel = input.difficulty

  if (input.preparationTime !== undefined) out.preparationTime = Number(input.preparationTime)
  else if (input.prepTime !== undefined)   out.preparationTime = Number(input.prepTime)

  if (input.category !== undefined)    out.category    = input.category
  if (input.ingredients !== undefined) out.ingredients = input.ingredients
  if (input.instructions !== undefined) out.instructions = input.instructions
  if (input.price !== undefined)       out.price       = Number(input.price)
  if (input.isPremium !== undefined)   out.isPremium   = !!input.isPremium
  if (input.servings !== undefined)    out.servings    = Number(input.servings)
  if (input.status !== undefined)      out.status      = input.status
  return out
}



const specSortToMongo = (sort) => {
  if (!sort || typeof sort !== 'string') return null
  const field = sort.startsWith('-') ? sort.slice(1) : sort
  const dir = sort.startsWith('-') ? -1 : 1
  switch (field) {
    case 'likesCount':
      return { likesCount: dir }
    case 'averageRating':
    case 'rating':
      return { rating: dir }
    case 'preparationTime':
      return { preparationTime: dir }
    case 'recipeName':
      return { recipeName: dir }
    case 'createdAt':
      return { createdAt: dir }
    default:
      return null
  }
}


const oidEquals = (a, b) => {
  if (!a || !b) return false
  if (a.equals) return a.equals(b)
  return String(a) === String(b)
}

module.exports = {
  toClient,
  toClientList,
  fromClient,
  specSortToMongo,
  oidEquals,
}
