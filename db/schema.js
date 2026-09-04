import pg from 'pg';
const { Pool } = pg;

// We use process.env.DATABASE_URL which Neon provides automatically in Vercel
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV !== 'development' ? { rejectUnauthorized: false } : undefined,
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- USERS
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        stripe_customer_id TEXT,
        subscription_tier TEXT DEFAULT 'free',
        subscription_status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- BOOKS
      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'couple',
        invite_code TEXT UNIQUE NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- MEMBERS
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        role TEXT DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book_id, user_id)
      );

      -- RESTAURANTS
      CREATE TABLE IF NOT EXISTS restaurants (
        id SERIAL PRIMARY KEY,
        book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT,
        lat REAL,
        lon REAL,
        cuisine TEXT,
        notes TEXT,
        added_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- DISHES
      CREATE TABLE IF NOT EXISTS dishes (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price_range TEXT,
        added_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- RATINGS
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        dish_id INTEGER REFERENCES dishes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
        order_again BOOLEAN NOT NULL DEFAULT false,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dish_id, user_id)
      );

      -- PHOTOS
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        dish_id INTEGER REFERENCES dishes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        file_path TEXT NOT NULL,
        caption TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Billing columns and the webhook dedup log. Kept as separate idempotent
    // statements so existing databases pick them up too — the CREATE TABLE
    // block above is a no-op once the tables exist.
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN NOT NULL DEFAULT false;

      CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_key
        ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

      -- Stripe retries any non-2xx delivery, so handlers must be replay-safe.
      CREATE TABLE IF NOT EXISTS processed_stripe_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Postgres Database initialized successfully.');
  } catch (err) {
    console.error("Error initializing database:", err);
    throw err; // a half-applied migration must not look like a successful boot
  } finally {
    client.release();
  }
}

// Function to check consensus
export async function checkConsensus(dishId, bookId) {
  // A dish has consensus IF AND ONLY IF:
  // 1. Every member of the book has submitted a rating for this dish
  // 2. Every rating.score >= 4
  // 3. Every rating.order_again = true

  const memberRes = await pool.query('SELECT COUNT(*) as count FROM members WHERE book_id = $1', [bookId]);
  const membersCount = parseInt(memberRes.rows[0].count, 10);
  
  if (membersCount === 0) return false;

  const ratingsRes = await pool.query('SELECT score, order_again FROM ratings WHERE dish_id = $1', [dishId]);
  const ratings = ratingsRes.rows;
  
  if (ratings.length < membersCount) return false; // Not everyone rated yet

  for (const rating of ratings) {
    if (rating.score < 4 || rating.order_again === false) {
      return false; // Someone rated < 4 or wouldn't order again
    }
  }

  return true;
}

// Optionally initialize DB on load in dev, but usually better via an explicit script or route
if (process.env.NODE_ENV === 'development' && process.env.DATABASE_URL) {
  initDb();
}

export default pool;
