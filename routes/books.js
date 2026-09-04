import express from 'express';
import { customAlphabet } from 'nanoid';
import db from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
// 6-character alphanumeric invite code (removed ambiguous characters like O, 0, I, l)
const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 6);

// GET /api/books - Get all books the user is a member of
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT b.*, m.role, m.joined_at 
      FROM books b
      JOIN members m ON b.id = m.book_id
      WHERE m.user_id = $1
      ORDER BY b.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching books' });
  }
});

// POST /api/books - Create a new book
router.post('/', requireAuth, async (req, res) => {
  const { name, mode } = req.body;
  if (!name) return res.status(400).json({ error: 'Book name is required' });
  
  const invite_code = nanoid();
  const validMode = ['couple', 'family', 'crew'].includes(mode) ? mode : 'couple';

  try {
    await db.query('BEGIN');
    
    // Create the book
    const insertBook = await db.query(
      'INSERT INTO books (name, mode, invite_code, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, validMode, invite_code, req.user.id]
    );
    const newBook = insertBook.rows[0];

    // Add creator as owner
    await db.query(
      'INSERT INTO members (book_id, user_id, role) VALUES ($1, $2, $3)',
      [newBook.id, req.user.id, 'owner']
    );
    
    await db.query('COMMIT');
    res.status(201).json(newBook);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create book' });
  }
});

// POST /api/books/join - Join a book using an invite code
router.post('/join', requireAuth, async (req, res) => {
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: 'Invite code is required' });

  try {
    const bookRes = await db.query('SELECT * FROM books WHERE invite_code = $1', [invite_code]);
    const book = bookRes.rows[0];
    
    if (!book) return res.status(404).json({ error: 'Invalid invite code' });

    // Check if already a member
    const memberRes = await db.query('SELECT * FROM members WHERE book_id = $1 AND user_id = $2', [book.id, req.user.id]);
    if (memberRes.rows.length > 0) {
      return res.status(400).json({ error: 'You are already a member of this book' });
    }

    // Check capacity based on mode
    const countRes = await db.query('SELECT COUNT(*) as count FROM members WHERE book_id = $1', [book.id]);
    const currentMembers = parseInt(countRes.rows[0].count, 10);
    
    const limits = { couple: 2, family: 8, crew: 12 };
    if (currentMembers >= limits[book.mode]) {
      return res.status(403).json({ error: `This ${book.mode} book is at maximum capacity` });
    }

    await db.query('INSERT INTO members (book_id, user_id, role) VALUES ($1, $2, $3)', [book.id, req.user.id, 'member']);
    
    res.json({ message: 'Successfully joined book', book });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join book' });
  }
});

export default router;
