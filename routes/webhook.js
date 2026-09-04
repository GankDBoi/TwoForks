import express from 'express';
import Stripe from 'stripe';
import db from '../db/schema.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/billing/webhook
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const tier = session.metadata?.tier; // 'pair' or 'table'
        
        if (userId && tier) {
          await db.query(`
            UPDATE users 
            SET subscription_tier = $1, subscription_status = 'active' 
            WHERE id = $2
          `, [tier, userId]);
          console.log(`Upgraded user ${userId} to ${tier}`);
        }
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.past_due':
      case 'customer.subscription.unpaid': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        await db.query(`
          UPDATE users 
          SET subscription_tier = 'free', subscription_status = $1 
          WHERE stripe_customer_id = $2
        `, [subscription.status, customerId]);
        console.log(`Downgraded customer ${customerId} due to subscription status: ${subscription.status}`);
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
