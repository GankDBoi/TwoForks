import express from 'express';
import { stripe, required } from '../lib/stripe.js';
import db from '../db/schema.js';

const router = express.Router();
const webhookSecret = required('STRIPE_WEBHOOK_SECRET');

/** Reverse map price ID -> tier, built from the same env vars checkout uses. */
const PRICE_TO_TIER = Object.fromEntries(
  ['pair', 'table'].flatMap((tier) =>
    ['monthly', 'yearly', 'lifetime']
      .map((cycle) => process.env[`STRIPE_${tier.toUpperCase()}_${cycle.toUpperCase()}`])
      .filter(Boolean)
      .map((priceId) => [priceId, tier])
  )
);

/**
 * Resolve the tier from the subscription's price rather than its metadata.
 * A plan change made in the Customer Portal updates the price but leaves the
 * metadata we wrote at checkout untouched, so metadata is only the fallback.
 */
function tierFromSubscription(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  return PRICE_TO_TIER[priceId] || subscription.metadata?.tier || null;
}

/** Period end moved onto the subscription item in recent API versions. */
function periodEnd(subscription) {
  const seconds =
    subscription.items?.data?.[0]?.current_period_end ??
    subscription.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

/** Statuses that should still grant paid access. */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Record the event ID first; a duplicate insert means Stripe redelivered an
 * event we already handled and we can return 200 without reprocessing.
 * Stripe retries on any non-2xx, so redelivery is normal, not exceptional.
 */
async function claimEvent(event) {
  const result = await db.query(
    `INSERT INTO processed_stripe_events (id, type)
     VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [event.id, event.type]
  );
  return result.rowCount > 0;
}

async function releaseEvent(eventId) {
  await db.query('DELETE FROM processed_stripe_events WHERE id = $1', [eventId]);
}

/** Grant paid access off a completed Checkout Session. */
async function fulfillCheckout(session) {
  // With delayed-notification payment methods, checkout.session.completed
  // arrives while the session is still unpaid. Fulfilling on that alone grants
  // access for payments that later fail.
  if (session.payment_status === 'unpaid') {
    console.log(`Session ${session.id} still unpaid — deferring fulfillment`);
    return;
  }

  const userId = session.client_reference_id || session.metadata?.userId;
  const tier = session.metadata?.tier;
  const isLifetime = session.metadata?.cycle === 'lifetime';

  if (!userId || !tier) {
    console.error(`Session ${session.id} missing userId/tier metadata`);
    return;
  }

  await db.query(
    `UPDATE users
     SET subscription_tier = $1,
         subscription_status = 'active',
         is_lifetime = $2,
         stripe_subscription_id = COALESCE($3, stripe_subscription_id),
         stripe_customer_id = COALESCE(stripe_customer_id, $4)
     WHERE id = $5`,
    [tier, isLifetime, session.subscription || null, session.customer, userId]
  );

  console.log(`Granted ${tier}${isLifetime ? ' (lifetime)' : ''} to user ${userId}`);
}

/** Mirror subscription lifecycle changes onto the user record. */
async function syncSubscription(subscription) {
  const customerId = subscription.customer;
  const status = subscription.status;
  const tier = tierFromSubscription(subscription);

  const keepsAccess = ACTIVE_STATUSES.has(status);
  const nextTier = keepsAccess && tier ? tier : 'free';

  // A lifetime purchase must survive the cancellation of any subscription the
  // same customer once held.
  await db.query(
    `UPDATE users
     SET subscription_tier = CASE WHEN is_lifetime THEN subscription_tier ELSE $1 END,
         subscription_status = $2,
         stripe_subscription_id = $3,
         current_period_end = $4
     WHERE stripe_customer_id = $5`,
    [nextTier, status, subscription.id, periodEnd(subscription), customerId]
  );

  console.log(`Customer ${customerId} subscription ${status} -> tier ${nextTier}`);
}

async function markPaymentFailed(invoice) {
  if (!invoice.customer) return;
  await db.query(
    `UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = $1`,
    [invoice.customer]
  );
  console.log(`Payment failed for customer ${invoice.customer}`);
}

// POST /api/billing/webhook
router.post('/', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  // Signature verification needs the exact bytes Stripe signed. Some hosts
  // (including Vercel's Node builder) parse the body before Express sees it.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
  if (!Buffer.isBuffer(rawBody)) {
    console.error(
      'Webhook body was parsed before reaching the handler — signature cannot be verified. ' +
        'Ensure express.raw() is mounted on this path before express.json().'
    );
    return res.status(400).send('Webhook Error: raw body unavailable');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Everything past this point is inside the try: Express 4 does not catch
  // rejections from async handlers, so an unhandled one would crash the process
  // rather than letting Stripe retry.
  let claimed = false;
  try {
    claimed = await claimEvent(event);
    if (!claimed) {
      console.log(`Event ${event.id} already processed — skipping`);
      return res.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await fulfillCheckout(event.data.object);
        break;

      case 'checkout.session.async_payment_failed':
        console.warn(`Async payment failed for session ${event.data.object.id}`);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object);
        break;

      case 'invoice.payment_failed':
        await markPaymentFailed(event.data.object);
        break;

      default:
        // Unhandled types are acknowledged, not retried.
        break;
    }

    res.json({ received: true });
  } catch (err) {
    // Let Stripe retry: drop the dedup claim so the retry is reprocessed.
    console.error(`Webhook handler error for ${event.type} (${event.id}):`, err);
    if (claimed) {
      await releaseEvent(event.id).catch((e) =>
        console.error('Failed to release event claim:', e)
      );
    }
    res.status(500).send('Internal Server Error');
  }
});

export default router;
