import jwt from 'jsonwebtoken';
import db from '../db/schema.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];

  // Verify the token first, and on its own. Wrapping the database lookup in the
  // same try meant a database blip surfaced as "invalid or expired token" —
  // every signed-in user appearing to be logged out, mid-checkout included.
  let decoded;
  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod'
    );
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  try {
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [
      decoded.id,
    ]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    // The token was valid; we just could not look the user up.
    console.error('Auth lookup failed:', err);
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}
