import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Create __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Webhook endpoint needs raw body to verify Stripe signature
// app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Middleware for parsing JSON (for all other routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Two Forks API is running' });
});

// Import and mount routes (To be implemented)
// import authRoutes from './routes/auth.js';
// import bookRoutes from './routes/books.js';
// import billingRoutes from './routes/billing.js';
// app.use('/api/auth', authRoutes);
// app.use('/api/books', bookRoutes);
// app.use('/api/billing', billingRoutes);

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
