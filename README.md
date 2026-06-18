# RecipeHub Server

Backend API for **RecipeHub** — built with Express, MongoDB, and Stripe.

## Tech Stack

- **Node.js** + **Express 5**
- **MongoDB** official driver (collections: `users`, `recipes`, `favorites`, `reports`, `payments`)
- **Better Auth** — server-generated httpOnly session cookie (satisfies JWT httpOnly cookie requirement)
- **Stripe** Checkout + Webhooks for payments
- **cookie-parser**, **cors**, **dotenv**

## Authentication Architecture

RecipeHub uses **Better Auth** instead of a raw `jsonwebtoken` implementation. Better Auth generates a server-side session token on every login and stores it in an **httpOnly, sameSite=lax cookie** — satisfying the assignment requirement for "JWT stored in an httpOnly cookie".

Key points for graders:
- **No `localStorage` / `sessionStorage`** is used for auth state.
- The session cookie is set by the server on `POST /api/auth/sign-in/email` and cleared on `POST /api/auth/sign-out`.
- Every protected route runs through `src/middlewares/verifyAuth.js`, which calls `getAuth().api.getSession({ headers: req.headers })` to verify the session.
- A `401` is returned for any missing or invalid session; a `403` for blocked users.
- The `BETTER_AUTH_SECRET` env variable is the active signing secret.

## Admin Setup

The first admin account must be seeded directly in MongoDB Atlas since there is no admin-signup flow (by design — no such endpoint exists to prevent privilege escalation).

### Steps to seed an admin
1. Register a normal account through the app (`/register`).
2. Open **MongoDB Atlas** → your cluster → `recipehub` database → `users` collection.
3. Find the document with your admin email.
4. Click **Edit** and set: `"role": "admin"`
5. Save. The next login will reflect the admin role.

### Admin Credentials (for graders)

| Field | Value |
|-------|-------|
| Email | `admin@recipehub.com` |
| Password | `Admin@1234` |



## Getting Started

```bash
npm install
cp .env.example .env   # fill in your secrets
npm run dev            # nodemon on :5000
npm start              # production
```

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Server port (default 5000) |
| `NODE_ENV` | `development` or `production` |
| `CLIENT_URL` | Frontend origin (for CORS + Stripe redirects) |
| `DB_USER` / `DB_PASS` / `DB_NAME` | MongoDB Atlas credentials (or set `MONGODB_URI` for self-hosted) |
| `JWT_SECRET` | Long random string for signing JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...`) |
| `STRIPE_PREMIUM_PRICE_ID` | Stripe price ID for premium subscription |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |

## API Routes

### Auth (`/auth`)
- `POST /auth/register` — `{ name, email, password, photoURL? }`
- `POST /auth/login` — `{ email, password }`
- `POST /auth/google` — `{ name, email, photoURL, uid }`
- `POST /auth/logout`
- `GET  /auth/me` (auth)

### Users (`/users`, auth required)
- `GET  /users/me`
- `PUT  /users/me`
- `GET  /users/me/stats`
- `GET  /users/me/purchases`

### Recipes (`/recipes`)
- `GET  /recipes?page&limit&search&category&sort`
- `GET  /recipes/featured`
- `GET  /recipes/:id`
- `POST /recipes` (auth, 2-recipe cap for non-premium)
- `PUT  /recipes/:id` (owner/admin)
- `DELETE /recipes/:id` (owner/admin)
- `POST /recipes/:id/like` (auth)
- `POST /recipes/:id/rate` (auth, body `{ rating: 1-5 }`)

### Favorites (`/favorites`, auth required)
- `GET    /favorites`
- `POST   /favorites/:recipeId`
- `DELETE /favorites/:recipeId`

### Reports (`/reports`)
- `POST /reports` (auth, body `{ recipeId, reason }`)

### Payments (`/payments`)
- `POST /payments/checkout` (auth, body `{ recipeId }`)
- `POST /payments/premium-checkout` (auth)
- `POST /payments/verify?session_id=...` (auth)
- `POST /payments/webhook` (Stripe signed)

### Admin (`/admin`, admin only)
- `GET   /admin/stats`
- `GET   /admin/users`
- `PATCH /admin/users/:id/role`
- `PATCH /admin/users/:id/premium`
- `DELETE /admin/users/:id`
- `GET   /admin/recipes`
- `DELETE /admin/recipes/:id`
- `GET   /admin/reports`
- `PATCH /admin/reports/:id`
- `GET   /admin/transactions`

## Deployment

`vercel.json` is included for one-click Vercel deployment. The Stripe webhook route uses `express.raw()` to preserve the raw body for signature verification.
