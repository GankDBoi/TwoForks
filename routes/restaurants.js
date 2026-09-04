import express from 'express';
import db from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { enforcePlaceLimit } from '../middleware/entitlements.js';

const router = express.Router({ mergeParams: true }); // allows accessing :bookId from parent router if needed

// GET /api/restaurants?book_id=123
router.get('/', requireAuth, async (req, res) => {
  const { book_id } = req.query;
  if (!book_id) return res.status(400).json({ error: 'book_id query parameter is required' });

  try {
    // Verify user is a member of this book
    const memberCheck = await db.query('SELECT * FROM members WHERE book_id = $1 AND user_id = $2', [book_id, req.user.id]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member of this book' });

    const { rows } = await db.query('SELECT * FROM restaurants WHERE book_id = $1 ORDER BY name ASC', [book_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch restaurants' });
  }
});

// POST /api/restaurants
router.post('/', requireAuth, enforcePlaceLimit, async (req, res) => {
  const { book_id, name, address, lat, lon, cuisine, notes } = req.body;
  
  if (!book_id || !name) return res.status(400).json({ error: 'book_id and name are required' });

  try {
    // Verify membership
    const memberCheck = await db.query('SELECT * FROM members WHERE book_id = $1 AND user_id = $2', [book_id, req.user.id]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member of this book' });

    const insertRes = await db.query(`
      INSERT INTO restaurants (book_id, name, address, lat, lon, cuisine, notes, added_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [book_id, name, address, lat, lon, cuisine, notes, req.user.id]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add restaurant' });
  }
});

export default router;
