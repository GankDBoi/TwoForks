import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'two-forks.db');
const db = new Database(dbPath);

// Enforce foreign keys
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      stripe_customer_id TEXT,
      subscription_tier TEXT DEFAULT 'free',
      subscription_status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- BOOKS
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'couple',
      invite_code TEXT UNIQUE NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- MEMBERS
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY,
      book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_id, user_id)
    );

    -- RESTAURANTS
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY,
      book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT,
      lat REAL,
      lon REAL,
      cuisine TEXT,
      notes TEXT,
      added_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- DISHES
    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
      book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_range TEXT,
      added_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- RATINGS
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY,
      dish_id INTEGER REFERENCES dishes(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      order_again BOOLEAN NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(dish_id, user_id)
    );

    -- PHOTOS
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY,
      dish_id INTEGER REFERENCES dishes(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      file_path TEXT NOT NULL,
      caption TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('Database initialized successfully.');
}

// Function to check consensus
export function checkConsensus(dishId, bookId) {
  // A dish has consensus IF AND ONLY IF:
  // 1. Every member of the book has submitted a rating for this dish
  // 2. Every rating.score >= 4
  // 3. Every rating.order_again = true (1)

  const membersCount = db.prepare('SELECT COUNT(*) as count FROM members WHERE book_id = ?').get(bookId).count;
  
  if (membersCount === 0) return false;

  const ratings = db.prepare('SELECT score, order_again FROM ratings WHERE dish_id = ?').all(dishId);
  
  if (ratings.length < membersCount) return false; // Not everyone rated yet

  for (const rating of ratings) {
    if (rating.score < 4 || rating.order_again === 0) {
      return false; // Someone rated < 4 or wouldn't order again
    }
  }

  return true;
}

// Initialize DB on file load (for simplicity)
initDb();

export default db;
