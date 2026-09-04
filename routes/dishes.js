import express from 'express';
import db from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/dishes?restaurant_id=123
router.get('/', requireAuth, async (req, res) => {
  const { restaurant_id } = req.query;
  if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id is required' });

  try {
    // 1. Verify access
    const restRes = await db.query('SELECT book_id FROM restaurants WHERE id = $1', [restaurant_id]);
    if (restRes.rows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
    const book_id = restRes.rows[0].book_id;
    
    const memberCheck = await db.query('SELECT * FROM members WHERE book_id = $1 AND user_id = $2', [book_id, req.user.id]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member of this book' });

    // 2. Fetch dishes
    const { rows: dishes } = await db.query('SELECT * FROM dishes WHERE restaurant_id = $1 ORDER BY created_at DESC', [restaurant_id]);
    
    // 3. For each dish, fetch all ratings
    for (let dish of dishes) {
      const { rows: ratings } = await db.query(`
        SELECT r.*, u.display_name, u.avatar_url 
        FROM ratings r 
        JOIN users u ON r.user_id = u.id 
        WHERE r.dish_id = $1
      `, [dish.id]);
      dish.ratings = ratings;
    }

    res.json(dishes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dishes' });
  }
});

// POST /api/dishes
router.post('/', requireAuth, async (req, res) => {
  const { restaurant_id, name, price_range } = req.body;
  
  if (!restaurant_id || !name) return res.status(400).json({ error: 'restaurant_id and name are required' });

  try {
    const restRes = await db.query('SELECT book_id FROM restaurants WHERE id = $1', [restaurant_id]);
    if (restRes.rows.length === 0) return res.status(404).json({ error: 'Restaurant not found' });
    const book_id = restRes.rows[0].book_id;
    
    const memberCheck = await db.query('SELECT * FROM members WHERE book_id = $1 AND user_id = $2', [book_id, req.user.id]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member of this book' });

    const insertRes = await db.query(`
      INSERT INTO dishes (restaurant_id, book_id, name, price_range, added_by)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [restaurant_id, book_id, name, price_range, req.user.id]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add dish' });
  }
});

export default router;
