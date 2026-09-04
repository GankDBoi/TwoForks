import express from 'express';
import { stripe, appUrl, integrationIdentifier } from '../lib/stripe.js';
import db from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const TIERS = ['pair', 'table'];
const CYCLES = ['monthly', 'yearly', 'lifetime'];

// Price IDs live in the environment as STRIPE_PAIR_MONTHLY, STRIPE_TABLE_YEARLY, etc.
const getPriceId = (tier, cycle) =>
  process.env[`STRIPE_${tier.toUpperCase()}_${cycle.toUpperCase()}`];

/**
 * Stripe Tax only collects in jurisdictions where you hold an ACTIVE registration.
 * With no registration it silently calculates zero tax while appearing to work, so
 * this stays off until you have registered and verified a calculation.
 * See README "Stripe Tax" before flipping it on.
 */
const automaticTaxEnabled = process.env.STRIPE_TAX_ENABLED === 'true';

/** Find or create the Stripe Customer for a logged-in user. */
async function getOrCreateCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.display_name,
    metadata: { userId: String(user.id) },
  });

  await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
    customer.id,
    user.id,
  ]);
  return customer.id;
}

// POST /api/billing/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  const { tier, cycle } = req.body;

  if (!TIERS.includes(tier) || !CYCLES.includes(cycle)) {
    return res.status(400).json({ error: 'Invalid tier or billing cycle' });
  }

  const priceId = getPriceId(tier, cycle);
  if (!priceId) {
    console.error(
      `Missing price ID env var STRIPE_${tier.toUpperCase()}_${cycle.toUpperCase()}`
    );
    return res.status(500).json({ error: 'Pricing configuration error' });
  }

  const isLifetime = cycle === 'lifetime';
  const metadata = { userId: String(req.user.id), tier, cycle };

  try {
    const customerId = await getOrCreateCustomer(req.user);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: isLifetime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],

      // No payment_method_types: omitting it enables dynamic payment methods, so
      // eligible wallets and local methods are chosen per customer and managed
      // from the Dashboard rather than hardcoded here.

      success_url: `${appUrl}/#dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/#settings?checkout=cancelled`,

      client_reference_id: String(req.user.id),
      metadata,
      allow_promotion_codes: true,
      automatic_tax: { enabled: automaticTaxEnabled },

      // The Customer already exists, so Checkout would reuse its saved address.
      // 'auto' writes back the address entered at checkout, which is what tax
      // should be calculated against.
      ...(automaticTaxEnabled ? { customer_update: { address: 'auto' } } : {}),

      // Carry identity onto the downstream object so subscription and payment
      // webhooks can resolve the user without a second lookup.
      ...(isLifetime
        ? {
            payment_intent_data: { metadata },
            // Generate a real invoice for one-time purchases — Checkout does not
            // create one by default in payment mode.
            invoice_creation: {
              enabled: true,
              invoice_data: {
                metadata,
                description: `Two Forks ${tier} — lifetime`,
              },
            },
          }
        : { subscription_data: { metadata } }),

      integration_identifier: integrationIdentifier(
        isLifetime ? 'lifetime' : 'subscription'
      ),
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
      return_url: `${appUrl}/#settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// GET /api/billing/invoices — receipts and billing history for the settings page
router.get('/invoices', requireAuth, async (req, res) => {
  const customerId = req.user.stripe_customer_id;
  if (!customerId) return res.json({ invoices: [] });

  try {
    const { data } = await stripe.invoices.list({
      customer: customerId,
      limit: 24,
    });

    res.json({
      invoices: data.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        created: invoice.created,
        total: invoice.total,
        tax: invoice.total_taxes?.reduce((sum, t) => sum + t.amount, 0) ?? 0,
        currency: invoice.currency,
        pdf: invoice.invoice_pdf,
        hosted: invoice.hosted_invoice_url,
      })),
    });
  } catch (err) {
    console.error('Invoice list error:', err);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

// GET /api/billing/me — current entitlement, for the UI to gate on
router.get('/me', requireAuth, async (req, res) => {
  res.json({
    tier: req.user.subscription_tier || 'free',
    status: req.user.subscription_status || 'active',
    currentPeriodEnd: req.user.current_period_end,
    hasBillingAccount: Boolean(req.user.stripe_customer_id),
  });
});

export default router;
