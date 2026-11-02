# Forma Studio — separate application branch

This branch contains Forma Studio. The SEMO Campus Web Studio remains on `main`.

## Current deployment status

Source imported from the supplied development ZIP. This is not yet a deployed public beta. The application currently uses local SQLite and local media storage. Persistent PostgreSQL/object storage migration and deployment verification remain to be completed before hosting it on an ephemeral filesystem.

No account databases, SQLite journal files, private uploads, or SEMO GitHub Pages workflows are included in this branch. Running locally creates a new database with fictional demo content.

For now, leave payment credentials unset. Live payment and withdrawal features require further work and verification; see FINANCE-SETUP.md. Do not merge this application branch into main.

## Next deployment steps

1. Configure the selected database and object-storage services.
2. Migrate database access and uploaded media to persistent services.
3. Disable purchases/withdrawals for the public beta and verify account isolation, uploads, and publishing.
4. Connect a separate Render service to the `forma-studio` branch. Keep SEMO GitHub Pages on main.

---

# Forma Studio — Multi-user portfolio CMS

A working Node.js application that allows each user to create an account, edit their public portfolio, change cover/profile/project images, publish research and projects, showcase courses/services, add external payment and donation links, and receive contact messages in a private dashboard.

## Run locally

Requires **Node.js 22.13+**. **No npm dependencies**.

```bash
npm start
```

Visit http://localhost:3000, select **Get started**, register, and edit at `/app`. Your public portfolio is at `/u/<your-slug>`. Edits are **not exported as ZIPs**: click **Save changes** to publish them immediately. Accounts, sessions, portfolio data, and contact messages persist in `data/portfolio.sqlite` using Node's built-in SQLite module. The `data` directory is excluded from this branch; it is created locally at runtime.

## Features

- Account registration and sign-in (password hashes generated using scrypt; server-side database-backed sessions).
- Private editor with live preview; saved changes immediately appear on public portfolio URLs.
- Responsive dark visual system with customizable accent, background photography, profile image, and project/course images.
- About, education, research, projects, publications, experience, storefront, contact, and donation areas.
- Multiple independent accounts, each with a unique URL.
- Contact form storing visitor messages to that owner's private inbox.
- Hosted **payment links** for donations, courses and services (Stripe Payment Links, PayPal links, Gumroad, etc.); no card data is collected or processed here.
- Images saved within the owner's portfolio record (JPG, PNG, WebP under 1.8 MB each). For a production platform, replace with object storage and image processing.

## Deployment and security notes

For local testing use `npm start`. To deploy online, use a Node-compatible host with persistent storage (or move the database to managed PostgreSQL). Set `NODE_ENV=production`, serve over HTTPS, provide a **persistent disk** for `DATA_DIR`, and configure backup and restore. Public demo hosting without persistent disk will lose data when restarted/redeployed. Production security work should include password reset/email verification, CSRF tokens, persistent rate limiting, anti-spam or CAPTCHA, content moderation, enhanced security monitoring, and a hardened session/cookie layer. The included demo uses origin checks, SameSite cookies, salted scrypt password hashes, server sessions, basic rate limits, and safe HTML escaping, but has not undergone a security audit.

Hosted payment checkout links are configured by each owner. Owners must create their own accounts with their payment processors and comply with the provider’s tax/KYC terms. The app does **not** process charges, verify payment success, automatically deliver paid courses, manage purchases, or send contact emails. Contact messages appear in the owner's private inbox. Add provider webhooks and access control to implement an actual paid-course platform.

## Try it

1. `npm start`
2. Register account and URL slug.
3. Go to Studio → use form fields and image uploaders → **Save changes**.
4. Open the public URL in an incognito window to see the published site.
5. Test the contact form and refresh the private inbox.
6. Add a course with a provider-created checkout link, and add a donation link.

## Custom pages & top navigation

In the dashboard, open **Page Manager**. Add a page with a custom title (Awards, Teaching, Blog, Publications, etc.), reorder its top-navigation position with the arrows, rename it, choose a format, or hide it. Custom pages can contain individually ordered paragraph, heading, card, image, link, and table blocks. The table editor accepts rows as `Item | Details | Notes`. Built-in pages support alternate cards, article, table, timeline, and gallery layouts. Hiding a built-in page removes its navigation button without destroying existing content. Deleting custom pages permanently removes their blocks after confirmation. Click **Save changes** to publish. Every user's page configuration is saved separately in SQLite.

The custom page URLs use `?page=<page-id>` on the user's public portfolio. As in the previous version, this is a local deployable web application, not a hosted service.


## Page-type editor update

- About and Contact are permanent, visible pages (their content and navigation labels are editable).
- Research defaults to cards, Publications to a table, Experience to a timeline, Courses & Services to storefront cards. Each can be switched to other layout options via Page Manager.
- All built-in and custom pages can use their own uploaded image background. The site-wide hero background remains independent.
- Custom pages support video blocks and built-in Research, Projects, Publications, Experience and Store entries have optional video fields. MP4/WebM uploads up to 15 MB are stored in the server's persistent DATA_DIR/media folder and served from /media/ with byte-range support. Hosting must persist this folder.
- Uploads are public if their URL is known. This is a small prototype, not a private course-video hosting service. Paid content requires access control, transaction verification and a production storage provider.
- Uploaded video files are not removed automatically when you delete a content block; production deployments should implement media cleanup and quotas.

## Structured page editors (new)
The Research, Publications, Experience, and Courses & Services editors now have additional fields specific to their content types, and the public site presents those details. Existing accounts and generic entries remain compatible. Publications support authors, venue, year, DOI and publication type; Research includes questions, methodology, findings, technologies and status; Experience includes employer, dates, location and achievements; Courses include category, duration, audience and contents. The editor saves all these fields through the existing profile endpoint.

This is still a development application. Payments rely on externally configured checkout links; it does not provide a course LMS, protected streaming video or automatic purchase fulfillment. To deploy publicly, configure HTTPS, durable database/media storage, backups, rate limits and email-verification/password-recovery flows.

## NEW: Paid courses, gated video, and subscriptions

**Do not upload restricted lessons to the ordinary public video uploader or public Courses & Services fields.** Use **Restricted Content → Paid courses and subscriptions** in the creator dashboard. That creates course records and private video files stored outside the public folder. Published course previews are visible to visitors, but lesson text and media require authenticated entitlements.

Set these environment variables on your secure server (never in frontend JS or version control):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_BASE_URL=https://your-own-domain.example
NODE_ENV=production
```

Configure the Stripe webhook at `https://your-own-domain.example/api/stripe/webhook` for events `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`. Use Stripe test mode first. The application receives only verified Stripe webhook events, creates course access after successful payment, and revokes access on cancellation/expiration. Only one-time purchases and individual-course monthly subscriptions are implemented; there is no bundled all-access membership, creator payout splitting, coupon management, tax automation, or refund synchronization.

**Merchant-of-record caveat:** Stripe Checkout uses the **site operator's** Stripe secret key, not each creator's individual Stripe account. Funds flow to the operator. Before enabling independent creators to sell and receive money, implement Stripe Connect onboarding, connected account charges/payouts, merchant terms, tax, and refund/dispute handling. Do not advertise this prototype as a ready-to-launch creator marketplace.

### Security and deployment cautions

- Secure lessons are read only from authenticated `/api/courses/:id/lesson`; private videos stream from authenticated `/api/courses/:id/video` and are never in the public media directory. Videos are currently capped at 15 MB. This is suitable only for small previews; production streaming should use authenticated object storage/signed short-lived access URLs and a CDN.
- Public course listings contain only course title, description, pricing, and lock state. Private lesson text is not included in the public profile JSON or HTML.
- Serve this on HTTPS with durable private disk/database storage. Use a reverse proxy with security headers and request limits; configure production authentication, password resets, email verification, and abuse controls before public launch.
- Recurring access depends on receiving Stripe invoice and subscription webhooks reliably. Add webhook retry monitoring and periodic Stripe reconciliation before operating a paid service. Handle payment disputes and refunds by explicitly revoking entitlement where appropriate.
- Payment success redirects do not grant access; only verified Stripe server-side events do. Sometimes a user may need to refresh after checkout for webhook processing.
- Existing publicly linked videos and course cards remain public; only the new **Restricted Content** module enforces a paywall.

## eSewa ePay (Nepal) — optional one-time NPR checkout

Creators may choose **Stripe (USD)** or **eSewa (NPR)** when creating a *one-time* paid course. eSewa recurring subscriptions are **not** implemented; use Stripe for monthly subscriptions. NPR prices are whole rupees. This app uses **a single platform operator merchant account**, not separate eSewa accounts for each creator. It does not split or distribute payments to creators.

Official developer reference: https://developer.esewa.com.np/pages/Epay

For sandbox testing set `PUBLIC_BASE_URL` to a real, publicly accessible **HTTPS** URL and, optionally:

```
ESEWA_MODE=test
ESEWA_PRODUCT_CODE=EPAYTEST
ESEWA_SECRET_KEY=<eSewa-documented-UAT-secret>
```

The default test code/secret come from publicly documented UAT credentials; **never use those in production**. To go live, obtain an approved eSewa merchant integration (generally requires Nepal merchant eligibility), then set `ESEWA_MODE=live`, `ESEWA_PRODUCT_CODE` and `ESEWA_SECRET_KEY` to your live merchant-issued values and use your own HTTPS `PUBLIC_BASE_URL`.

Checkout starts a signed POST to eSewa. On returning to `/api/esewa/return`, the server validates the order ID and reported amount and independently calls eSewa's **transaction status API**. It unlocks the course only when the gateway confirms `COMPLETE` for the exact amount, transaction, and merchant code. Unknown, pending, canceled and failed payments do not unlock lessons. If status checking fails, access remains locked; retry/reconciliation is needed. A checkout page redirect **does not** prove payment. Refunds and reversals are not yet automatically reconciled; do not use this prototype for live financial transactions before implementing that, audit/reconciliation, and production security reviews.

IMPORTANT: Payment proceeds go to the **operator's** merchant account. The app does not connect individual creators' eSewa wallets, onboard merchants, do KYC, manage settlement, or pay out sellers. eSewa merchant onboarding information: https://blog.esewa.com.np/documents-required-esewa-merchant-api-integration
