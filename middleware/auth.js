import jwt from 'jsonwebtoken';
import db from '../db/schema.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod');
    
    // Attach user to request
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = userRes.rows[0];
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth Error:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}
