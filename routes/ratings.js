import express from 'express';
import db, { checkConsensus } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// POST /api/ratings
router.post('/', requireAuth, async (req, res) => {
  const { dish_id, score, order_again, notes } = req.body;

  if (!dish_id || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Valid dish_id and score (1-5) required' });
  }

  try {
    // 1. Verify access
    const dishRes = await db.query('SELECT book_id FROM dishes WHERE id = $1', [dish_id]);
    if (dishRes.rows.length === 0) return res.status(404).json({ error: 'Dish not found' });
    const book_id = dishRes.rows[0].book_id;
    
    const memberCheck = await db.query('SELECT * FROM members WHERE book_id = $1 AND user_id = $2', [book_id, req.user.id]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member of this book' });

    // 2. Upsert rating (one per user per dish)
    const upsertRes = await db.query(`
      INSERT INTO ratings (dish_id, user_id, score, order_again, notes, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (dish_id, user_id) 
      DO UPDATE SET 
        score = EXCLUDED.score, 
        order_again = EXCLUDED.order_again, 
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [dish_id, req.user.id, score, order_again === true, notes || '']);

    // 3. Re-evaluate consensus status
    const hasConsensus = await checkConsensus(dish_id, book_id);
    
    res.json({
      rating: upsertRes.rows[0],
      hasConsensus
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

export default router;
