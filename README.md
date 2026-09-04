# Two Forks

A shared book of the dishes you and your person actually loved.

## Running locally

```bash
cp .env.example .env   # then fill it in
npm install
npm run dev
```

`DATABASE_URL` must point at a Postgres instance. Tables and billing columns are
created by `initDb()` in `db/schema.js`.

---

# Stripe integration

Two plans (`pair`, `table`) x three cycles (`monthly`, `yearly`, `lifetime`).
Monthly and yearly are subscriptions; lifetime is a one-time payment.

| Piece | Where |
| --- | --- |
| Shared `StripeClient` (pinned API version) | `lib/stripe.js` |
| Checkout, Billing Portal, invoice list | `routes/billing.js` |
| Event handler | `routes/webhook.js` |
| Plan limits and gating | `middleware/entitlements.js` |

## Price IDs

Env var names are built from the tier and cycle, so they must match exactly:

```
STRIPE_<TIER>_<CYCLE>    e.g. STRIPE_PAIR_MONTHLY, STRIPE_TABLE_LIFETIME
```

## API keys

Use a **restricted key** (`rk_...`), not a secret key (`sk_...`). This app needs:

| Resource | Access |
| --- | --- |
| Customers | write |
| Checkout Sessions | write |
| Billing Portal Sessions | write |
| Invoices | read |
| Subscriptions | read |

Create one at **Dashboard → Developers → API keys → Restricted keys**.

## Webhooks — required, not optional

Nothing is fulfilled from the success page. A customer can pay and then lose
their connection before the page loads, so access is granted only by the event
handler. Without `STRIPE_WEBHOOK_SECRET` set, every delivery is rejected and
**no purchase is ever fulfilled.**

Local:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Deployed: **Dashboard → Developers → Webhooks**, endpoint
`https://<your-domain>/api/billing/webhook`, subscribed to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Notes on the handler:

- Fulfillment is gated on `payment_status !== 'unpaid'`. Delayed-notification
  payment methods complete the session before the money arrives.
- Event IDs are recorded in `processed_stripe_events` before processing. Stripe
  retries every non-2xx, so redelivery is normal and must be a no-op.
- Tier is resolved from the subscription's **price**, not from checkout metadata
  — a plan change made in the Customer Portal updates the price and leaves the
  original metadata behind.
- `is_lifetime` users are never downgraded by subscription events.

## Stripe Tax

`STRIPE_TAX_ENABLED` is `false` by default, and should stay that way until the
setup below is done.

Stripe Tax only collects in jurisdictions where you hold an **active
registration**. With no registration it does not error — it calculates zero tax
while the integration looks like it is working. Turning the flag on before
registering means believing you are collecting tax when you are not, and past
transactions **cannot be corrected retroactively**.

This was measured against this account, not assumed. With `automatic_tax`
enabled today, `checkout.sessions.create` **succeeds**:

```
automatic_tax.status : requires_location_inputs
amount_total         : 399
amount_tax           : 0
```

The session is created, the customer is charged, and zero tax is collected — no
error anywhere. (The Tax Calculations API does error, with "You must have a valid
head office address", but Checkout does not.) That silent success is the whole
reason the flag exists.

1. Set a head office address: **Dashboard → Tax → Settings**. Until this is set,
   settings `status` is `pending` and `automatic_tax` calculates nothing.
2. Add a registration for each jurisdiction you are obligated to collect in
   (Dashboard, or the [Tax Registrations API](https://docs.stripe.com/api/tax/registrations.md)).
   Which jurisdictions those are is a question for your tax advisor.
3. Set a product tax code on each Stripe Product. Do not guess a `txcd_` value —
   take it from the [tax code guide](https://docs.stripe.com/tax/tax-codes.md).
   `txcd_10103001` (SaaS) is the usual starting point for software like this, but
   confirm it fits.
4. Set `STRIPE_TAX_ENABLED=true`.
5. Verify with a [test calculation](https://docs.stripe.com/tax/testing.md) using
   an address in a registered jurisdiction. Check `taxability_reason`, not the
   amount — `not_collecting` means the setup is still broken.

Threshold monitoring (**Tax → Locations → Needs attention**) only counts
**live-mode** transactions. Test volume contributes nothing, so the nexus clock
starts at zero on launch day.

## Invoicing

Subscriptions generate invoices automatically. One-time (lifetime) purchases do
not, so Checkout is configured with `invoice_creation.enabled` for them.

`GET /api/billing/invoices` returns the customer's invoice history with hosted
and PDF links. The Customer Portal also exposes it.

## Payment methods

`payment_method_types` is deliberately **not** set anywhere. Omitting it enables
dynamic payment methods, so eligible wallets and local methods are selected per
customer and managed from **Dashboard → Payment methods** without a code change.

## Plan limits

`middleware/entitlements.js` is the single source of truth, and returns `402` with
`{ upgrade: true, requiredTier }` when a limit is hit.

> The free-tier caps (25 dishes, 15 places per book) are placeholders — they are
> not stated in the pricing copy. Confirm them before launch.

## Testing the flow

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
# card 4242 4242 4242 4242, any future expiry, any CVC
```

Test cards for other paths: [docs.stripe.com/testing](https://docs.stripe.com/testing.md).
For renewals, failed payments, and cancellations, use
[test clocks](https://docs.stripe.com/billing/testing/test-clocks.md) rather than
waiting a month.

## Before going live

- [ ] Swap test keys for live restricted keys
- [ ] Create a live-mode webhook endpoint and set its signing secret
- [ ] Recreate Products and Prices in live mode; update all six price ID vars
- [ ] Set `APP_URL` to the production origin
- [ ] Complete the Stripe Tax steps above, then enable the flag
- [ ] Configure the Customer Portal: **Settings → Billing → Customer portal**
- [ ] Walk the [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live.md)
