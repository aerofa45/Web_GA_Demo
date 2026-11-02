# Forma Studio — portfolio builder beta

Forma lets students, researchers, and creators publish a personal portfolio and maintain it without editing code. It supports account registration, sign-in, live editing, custom pages, public portfolios, optimized image uploads, and a private contact inbox.

This application lives on **forma-studio** in aerofa45/Web_GA_Demo. The SEMO Campus Web Studio remains on **main**. Keep their hosting separate; do not merge these application roots.

## Architecture

- Node.js HTTP backend and plain JavaScript/CSS frontend. This is not a React, Tailwind, or Cascade CMS application.
- Supabase PostgreSQL persists accounts, password hashes, sessions, portfolios, inbox messages, upload reservations, and rate limits.
- Supabase Storage persists public portfolio images. Sharp validates/decodes, strips metadata, resizes to at most 1600×1600, and encodes WebP.
- Render runs the stateless server; no accounts or uploads are written to Render's temporary filesystem.
- Passwords use salted asynchronous scrypt; session tokens are random, hashed at rest, HttpOnly, SameSite, and Secure in production. Backend requests enforce owner scoping. Database tables have RLS enabled and no anon/authenticated privileges. Only the backend service role can access them.

## Setup

1. Create a dedicated Supabase project. Run `supabase/schema.sql` in its SQL editor. It creates six `forma_` tables, three backend-only functions, and the `forma-images` bucket.
2. Use Node 22.13+ or Node 24. Run `npm ci`.
3. Set the environment variables in `.env.example`. Keep the service-role key in private server environment settings only. Do not put it in the frontend, source control, screenshots, or logs. The application fails closed if cloud storage is not configured.
4. For local use, set APP_ORIGIN to http://localhost:3000 and run `npm start`. Node does not load `.env` automatically; use `node --env-file=.env cloud-server.js` if using a local file.
5. For Render, create a separate **Free Web Service**, use this repository's **forma-studio** branch, build `npm ci`, start `npm start`, and health check `/healthz`. Set NODE_ENV=production, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY. Render's RENDER_EXTERNAL_URL supplies the origin; set APP_ORIGIN only for a custom domain or local testing.

No GitHub Pages workflow is included. Node APIs cannot run on GitHub Pages. See render.yaml for the deployment configuration.

## Beta scope and limits

Payments, purchases, subscriptions, private lessons, withdrawals, and video uploads are disabled on both the UI and backend. Course outlines can be presented as ordinary public portfolio content. No payment provider credentials are required.

Each account can upload 30 images, at most 1.8 MB input and 1 MB optimized output each. Images are public immediately after upload. Removing an image from a portfolio does not reclaim its quota or delete the stored object. Contact the project owner for removal. Sign-in emails are not automatically added to public profiles.

This is a limited experimental beta, not audited production software. Email verification, self-service password reset, automated moderation, self-service account deletion, and production monitoring remain future work. Use a unique password. Do not store confidential material. Contact achaudhary11s@semo.edu for removal/support. The in-app `/privacy` page explains data handling.

Free providers can sleep, pause, or enforce limits. Keep source content separately. The free Supabase tier does not provide a guaranteed automated backup/recovery service: use the Supabase CLI `db dump` and a separate storage export before schema changes. Store exports privately, never commit them. Test restores to a separate project before relying on them. No automated backup has been configured by this repository.

## Tests and release checks

`npm test` runs backend tests against an in-memory test double: account/session flow, owner scoping, public/private email separation, rejected cross-site requests, image validation, and disabled payment routes. They do not prove hosted RLS or cloud durability.

Before inviting testers, verify against the actual Supabase project: signup/login, public publication, image upload, private inbox isolation, anonymous database denial, and saved content after Render restart. Automated checks alone do not establish WCAG conformance. Test keyboard, focus, contrast, screen readers, and mobile layouts separately.

## Operations

The SQL schema is repeatable and does not replace existing tables. Treat future schema changes as migrations: export data first, test in a separate project, apply compatible changes, then deploy. Do not import the database files from the original ZIP. For rollback, deploy an earlier compatible Forma commit; never point Render at main.

Expired sessions and rate-limit rows should be pruned periodically by an administrator. For a removal request, verify ownership, remove the user's objects through Supabase Storage, then remove the corresponding forma_users row; dependent rows cascade. Do not delete another user's data.
