import express from 'express';
import Stripe from 'stripe';
import db from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map the combinations to the ENV variables we generated
const getPriceId = (tier, cycle) => {
  const key = `STRIPE_${tier.toUpperCase()}_${cycle.toUpperCase()}`;
  return process.env[key];
};

// POST /api/billing/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  const { tier, cycle } = req.body; // tier: 'pair'|'table', cycle: 'monthly'|'yearly'|'lifetime'

  if (!['pair', 'table'].includes(tier) || !['monthly', 'yearly', 'lifetime'].includes(cycle)) {
    return res.status(400).json({ error: 'Invalid tier or billing cycle' });
  }

  const priceId = getPriceId(tier, cycle);
  if (!priceId) {
    return res.status(500).json({ error: 'Pricing configuration error' });
  }

  const mode = cycle === 'lifetime' ? 'payment' : 'subscription';

  try {
    let customerId = req.user.stripe_customer_id;
    
    // Create Stripe customer if they don't have one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.display_name,
        metadata: { userId: req.user.id }
      });
      customerId = customer.id;
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode,
      success_url: `${req.protocol}://${req.get('host')}/#dashboard?success=true`,
      cancel_url: `${req.protocol}://${req.get('host')}/#settings`,
      client_reference_id: req.user.id.toString(),
      metadata: { tier, cycle }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/billing/portal
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const customerId = req.user.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'No active billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.protocol}://${req.get('host')}/#settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});



export default router;
