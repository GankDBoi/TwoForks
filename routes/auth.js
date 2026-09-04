import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import db from '../db/schema.js';

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: google_id, email, name: display_name, picture: avatar_url } = payload;

    // Check if user exists
    const userRes = await db.query('SELECT * FROM users WHERE google_id = $1', [google_id]);
    let user = userRes.rows[0];

    if (!user) {
      // Check if email already exists but not linked to google_id (edge case)
      const existingEmailRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const existingEmail = existingEmailRes.rows[0];
      
      if (existingEmail) {
        // Link google account
        await db.query(
          'UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3',
          [google_id, avatar_url, existingEmail.id]
        );
        const updatedRes = await db.query('SELECT * FROM users WHERE id = $1', [existingEmail.id]);
        user = updatedRes.rows[0];
      } else {
        // Create new user
        const insertRes = await db.query(`
          INSERT INTO users (google_id, email, display_name, avatar_url)
          VALUES ($1, $2, $3, $4) RETURNING *
        `, [google_id, email, display_name, avatar_url]);
        
        user = insertRes.rows[0];
      }
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod', 
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        subscription_tier: user.subscription_tier
      }
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

export default router;
