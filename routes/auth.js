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
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);

    if (!user) {
      // Check if email already exists but not linked to google_id (edge case)
      const existingEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (existingEmail) {
        // Link google account
        db.prepare('UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?').run(google_id, avatar_url, existingEmail.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingEmail.id);
      } else {
        // Create new user
        const result = db.prepare(`
          INSERT INTO users (google_id, email, display_name, avatar_url)
          VALUES (?, ?, ?, ?)
        `).run(google_id, email, display_name, avatar_url);
        
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
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
