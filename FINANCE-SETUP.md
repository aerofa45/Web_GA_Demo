# Forma Studio — payments and royalties (development build)

## Start

Requires Node.js >=22.13. Run `npm start` in `portfolio-live`, then open http://localhost:3000.

Optional environment variables (PowerShell syntax):

```
$env:FORMA_ADMIN_EMAIL='owner@example.com'
$env:ROYALTY_HOLD_DAYS='14'
npm start
```

**Protect the admin email account.** `FORMA_ADMIN_EMAIL` identifies the already registered user who can view the manual payout queue and mark requests paid/rejected. Do not give this login to instructors. Do not use production payouts before implementing MFA, security review, audit controls, and proper account verification.

## What was added

- `royalty_sales`: every verified Stripe **one-time** course purchase or verified eSewa one-time purchase records a 95% instructor royalty and 5% platform share. Sale refs are unique, so duplicate verification doesn't create a second royalty.
- `GET /api/earnings`: creator's sales, balance per currency, and withdrawal requests.
- `POST /api/withdrawals`: authenticated creator requests payment from **eligible** earnings only. Server reserves the request's amount.
- `GET /api/admin/withdrawals`: admin queue.
- `POST /api/admin/withdrawals/:id/status`: mark `paid` (requires a bank transfer reference) or `rejected` (releases reserved balance). **Does not transfer funds.**
- `GET /api/payment-connectors`: honest provider status. Stripe and eSewa have initial integrations; Razorpay/UPI, Khalti, SSLCOMMERZ, and bKash are shown as NOT INTEGRATED, not usable checkouts.
- Front-end earnings and payouts section in creator studio.

Currency conventions: Stripe amounts are **USD cents**. eSewa amounts are **NPR whole rupees**. This mismatch is made explicit in the withdrawal UI and API to prevent accidental conversions.

## Existing eSewa/Stripe configuration

The existing application uses `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `PUBLIC_BASE_URL`, and eSewa variables `ESEWA_MODE`, `ESEWA_PRODUCT_CODE`, and `ESEWA_SECRET_KEY`. Read the original README for payment setup. Do not put secret keys in browser code. Use sandbox/test environments first.

To change legal merchants in future: set up a NEW approved account, deploy new keys, test them, then change new checkouts to the new account. Keep prior merchant transaction records for chargebacks and refunds. Current code does not yet expose a zero-downtime multi-merchant switchboard; do not change live credentials during in-flight purchases.

## Not production-ready yet

1. No real gateway credentials or live payments tested.
2. **Recurring subscriptions do not accrue royalties** in this version. Do not activate paid subscriptions with the 95/5 promise until renewal, cancellation, tax, and royalty accounting are complete.
3. Refunds, chargebacks, and partial refunds do not automatically reverse royalty entries. Do not pay out real royalties until implemented and reconciled.
4. No automatic/manual bank transfer is performed by the server; admin records external payout after paying separately.
5. Not a comprehensive double-entry accounting engine. No KYC, tax withholding, payout beneficiary verification, real exchange-rate handling, platform reserves, or reconciliation service.
6. Cannot take UPI, Khalti, bKash, or SSLCOMMERZ payments yet. They require provider approval and authenticated callbacks, plus tests.
7. The existing application stores account sessions and SQLite data locally. Add HTTPS deployment, backup, stronger authentication/MFA, privacy, production security review, CSRF hardening, and video storage scaling.
8. A 5% share may not cover processor fees, taxes, refunds, or infrastructure.

## Test

`npm test` runs local endpoint/security smoke tests. Tests don't simulate real provider payment events.
