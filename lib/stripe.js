import Stripe from 'stripe';

/**
 * Single shared StripeClient.
 *
 * Stripe's SDKs deprecated the global `stripe.api_key = ...` pattern; always
 * instantiate a client and call methods on the instance.
 */

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

export const stripe = new Stripe(required('STRIPE_SECRET_KEY'), {
  // Pin the version so a Stripe-side upgrade can never silently change
  // response shapes underneath us.
  apiVersion: '2026-08-26.dahlia',
  appInfo: { name: 'two-forks', url: 'https://two-forks-sand.vercel.app' },
});

/** Public origin used to build Checkout return URLs. */
export const appUrl = (
  process.env.APP_URL || 'http://localhost:3000'
).replace(/\/$/, '');

/**
 * Tag Checkout Sessions so flows are comparable in the Dashboard.
 * Stripe asks for an 8-random-letter suffix on the label.
 */
const randomLetters = (n) =>
  Array.from({ length: n }, () =>
    'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
  ).join('');

export const integrationIdentifier = (flow) =>
  `two-forks-${flow}-${randomLetters(8)}`;

export { required };
