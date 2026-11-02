# Phase 1 audit and verification — 2026-11-02

Base: forma-studio-test at e872e093f9d3465312c0cacb4855eda2faae4a94.
Work branch: fix/course-generation-validation.

## Verified deployment identity
Authenticated Render dashboard identifies service forma-studio-test, ID srv-dbkenbjbc2fs739598u0, repository aerofa45/Web_GA_Demo, branch forma-studio-test, address https://web-ga-demo.onrender.com. Last deployed commit at audit time: e872e09. Auto-deploy entries are present. No deploy was performed for this change.

## Audit findings
- Existing tests covered portfolios/accounts but no course or Gemini behavior.
- Gemini validated only the outer chapters array, allowing null chapters and malformed lessons into the editor and causing save errors.
- PDF source was implicitly the first lesson with an attachment.
- Late generation responses could be appended to a different active course.
- Save accepted another course's PDF identifier without checking its metadata ownership.
- Upstream timeout/network failures and invalid response bodies became generic 500 errors.
- render.yaml and README deployment instructions refer to production. Do not use them for staging deployment without checking dashboard configuration.
- Six base tables plus four course/OAuth/enrollment tables plus one PDF table are declared. Course migrations use transactions, RLS, and backend-only grants. Their actual application, grants, private bucket configuration, and eleven-table count remain unverified in the hosted test database.
- OAuth tables exist, but no Drive OAuth/Picker implementation is present. Student learning flows are absent. Course published flag exists but has no publish API/editor control. YouTube URLs validate on save, but the editor has no embedded playback and CSP lacks a YouTube frame-src allowance.

## Implemented
Shared nested outline validation for saves and generated responses; PDF course/owner checks on save; explicit typed-note or lesson/PDF selection; duplicate generation prevention; stale-response protection; invalid PDF input validation before Gemini limiter charge; useful timeout, transport, incomplete-generation, and malformed-response errors. No database or deployment configuration changes.

## Actual checks
npm ci succeeded; audit reported zero vulnerabilities.
Baseline npm test: 9 passed, 0 failed.
Updated npm test: 12 passed, 0 failed.
New tests cover nested validation, authenticated text/PDF request construction, draft save/reopen with attached PDF, owner isolation, upstream 429/403, timeout, invalid JSON, truncated response, and malformed outline. Gemini and Supabase are mocked; these checks do not prove live generation or database durability.
Syntax checks passed for cloud-server.js and public/course-studio.js. git diff --check passed.

## Pending work and access
The staging course page redirects to login in the available in-app browser. An authenticated testing session is needed for real text/PDF generation and save/reopen verification without obtaining secrets. Render runtime logs were opened; no actual upstream Gemini response has yet been established. Do not attribute the live failure to quota without upstream evidence.
Individual lesson/chapter regeneration, assignments, publishing, YouTube embeds, upload cleanup, concurrency-safe saves, full browser regression, hosted migration checks, and live generation remain Phase 1 work. Drive and the student LMS should follow stability verification. No production branch, Supabase project, billing, or payment configuration was changed.

## Authenticated hosted checks
On 2026-11-02, created isolated draft QA Phase 1 - Probability. Real text generation returned model unavailable; Render runtime log confirmed Gemini upstream status: 404 NOT_FOUND. Uploaded a one-page fictional probability PDF, saved a manual lesson and attachment, reloaded the page, and reopened the course: lesson content and PDF association persisted. PDF-only generation also returned model unavailable. No successful live generation is claimed. No existing course or portfolio was edited.

Added optional server-only GEMINI_MODEL configuration, retaining the existing default until an available model is selected. Invalid model paths fail closed. Tests: 13 passed, 0 failed after allowing local test-server connections. Initial test attempt was blocked by local network permission (EACCES); code tests passed after permission was granted. Google documentation says gemini-2.5-flash access is limited to established users; this is consistent with, but does not conclusively explain, the upstream 404. Source: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash

Deployment remains pending. Changes are on the feature branch; no test service environment settings or production resources were changed.
