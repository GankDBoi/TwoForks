// Must come first: ES module imports are evaluated before any statement in this
// file runs, so a plain dotenv.config() call down here would execute AFTER the
// route modules below had already read process.env and thrown.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Create __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import restaurantRoutes from './routes/restaurants.js';
import dishRoutes from './routes/dishes.js';
import ratingRoutes from './routes/ratings.js';
import decideRoutes from './routes/decide.js';
import billingRoutes from './routes/billing.js';
import webhookRoute from './routes/webhook.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// The webhook needs the unparsed body to verify Stripe's signature, so it is
// mounted with express.raw() BEFORE express.json() claims the request.
app.use(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  webhookRoute
);

// Middleware for parsing JSON (for all other routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Two Forks API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/decide', decideRoutes);
app.use('/api/billing', billingRoutes);

// Unmatched API routes get JSON, not the SPA shell — otherwise a typo'd
// webhook or callback URL returns 200 + HTML and looks like it worked.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Two Forks server running on http://localhost:${PORT}`);
});

export default app;
