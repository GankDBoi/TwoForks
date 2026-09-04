import express from 'express';
import db, { checkConsensus } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/decide?book_id=123
// Returns all consensus-stamped dishes for a given book, grouped by restaurant.
router.get('/', requireAuth, async (req, res) => {
  const { book_id } = req.query;
  if (!book_id) return res.status(400).json({ error: 'book_id query parameter is required' });

  try {
    // 1. Verify access
    const memberCheck = await db.query('SELECT * FROM members WHERE book_id = $1 AND user_id = $2', [book_id, req.user.id]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member of this book' });

    // 2. Fetch all dishes in this book
    const { rows: allDishes } = await db.query(`
      SELECT d.*, r.name as restaurant_name, r.cuisine, r.lat, r.lon
      FROM dishes d
      JOIN restaurants r ON d.restaurant_id = r.id
      WHERE d.book_id = $1
    `, [book_id]);

    // 3. Filter down to only dishes that have consensus
    const consensusDishes = [];
    for (const dish of allDishes) {
      const hasConsensus = await checkConsensus(dish.id, book_id);
      if (hasConsensus) {
        consensusDishes.push(dish);
      }
    }

    res.json(consensusDishes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate consensus dishes' });
  }
});

export default router;
