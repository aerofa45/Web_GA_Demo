# Forma Studio AI-first architecture (staging plan)

## Product
One backend for (1) traditional visual editing, (2) on-site conversational assistant and (3) optional user-authorized ChatGPT connector. The interfaces never receive the Supabase service-role key.

## Authorization
- Application session -> authenticated user -> account role -> resource ownership check on every action.
- Student: own subscription status, approved enrollment, own grades/submissions and accessible lessons; no instructor course-edit endpoints.
- Instructor: own courses, owned portfolios, own roster and assessment settings. Never cross-tenant changes.
- Platform admin is a distinct future protected service role, not granted through instructor signup or ChatGPT.
- Connecting ChatGPT requires user-specific OAuth authorization, explicit consent, scoped tokens, expiry and revocation; not implemented yet.

## Editing protocol (initial implementation)
- POST /api/course-edit: preview by default, confirm:true plus expectedUpdated for save; currently supports rename-course, add-chapter, rename-chapter, add-lesson, edit-lesson, remove-lesson.
- POST /api/portfolio-edit: preview by default, confirm:true for save; sections experience, education, research, projects, publications.
- GET /api/assistant/history: authenticated history for caller only.
- Every confirmed edit records an audit entry. Audit collection is not a version history or undo system.
- Ownership checks are performed in backend rather than trusting a course ID supplied by ChatGPT.

## Planned additions and ordering
1. Harden existing operations: optimistic concurrency for portfolios, atomic data-change + audit transaction, undo/version snapshots, end-to-end authorization tests.
2. Unified action schema for course/portfolio and educational materials. Upload resource metadata and extraction; ask model for structured proposed operations; validate deterministic actions. Prompts never become SQL.
3. Instructor workspace with split chat and live draft preview; confirmation for publishing, deleting, price changes; clear autosave indicators.
4. ChatGPT connection: OAuth authorization server, narrowly-scoped API endpoints, token rotation/revocation, connector tool definitions. Validate connected-user identity server-side; never share administrator keys.
5. Separate payment entitlement service; verified Stripe webhooks and subscription lifecycle; regional gateway adapters (e.g. Bangladesh) pending merchant eligibility and regulatory review.
6. Production readiness: role matrix tests, tenant isolation, accessibility, monitoring, retries, data retention and backup recovery.

## Important current limits
- No actual ChatGPT integration or AI intent parser yet.
- Changes from /api/course-edit and /api/portfolio-edit are structured calls, not chat language.
- Change history logs operations but does not support undo.
- Course pages may expose published text publicly; paid lesson gating needs a separate enforcement project.
- No browser-tested purchase, renewal or cancellation demonstrated.
- Staging only. Do not promote until authorization, payment and workflow tests are complete.
