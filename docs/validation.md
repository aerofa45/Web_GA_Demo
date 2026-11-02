# Verification record

Prepared November 1, 2026 (America/Chicago). Runtime: Node 24.19.0, JDK 21, Windows. See repository CI for Linux runs and the exact tested revision.

- Unit suite: 19 tests (6 workflow/storage tests plus 13 text/UI contrast checks) covering invalid publication, review return, audit history, storage recovery, published content and timestamp ordering.
- Apache Velocity: 3 real-engine checks passed (XML selection/repetition, escaping, missing page). Rendered output and JSON evidence are included.
- Production build: prerendered HTML generated. The public page and Alpine checklist work without JavaScript.
- Browser suite: 13 scenarios per engine, including the Java lab. Chromium and WebKit were exercised locally. Firefox failed to start in this Windows environment; the same suite is configured in Linux CI, where its result must be checked before claiming a pass.
- Accessibility checks: axe WCAG A/AA tags; raw violations, incomplete checks, passed rules and accessibility tree saved per engine. Zero violations in tested program/studio states on the successful local scans.
- Added robustness checks: 320px reflow combined with 200% text and spacing overrides; keyboard-only submission; error handling; text injection; no-JS; forced colors; reduced motion; rendered internal links/fragments/images; local page persistence/reset; Java/XML preview persistence.
- Image exercise: actual miniPaint import, Lanczos resize, canvas crop, JPEG quality 82 export and native editable project saved. Responsive derivatives generated from the edited JPEG. Actual byte counts are in `public/images/manifest.json`.
- SEO: visible content in initial HTML; real CreativeWork JSON-LD; social tags; deployment-configured canonical URL/sitemap and crawl directives; favicon.
- Dependency audit: Lighthouse pinned to 13.5.0 after the newer version introduced reported moderate dependency issues; audit then reported zero vulnerabilities.
- Lighthouse: measured lab results are in `evidence/performance-summary.json` and `evidence/lighthouse.html`. Interpret the exact report URL/crawl mode and date. Local noindex builds intentionally fail the indexability check; a public build is separately audited after enabling its crawl mode. Scores are measurements, not guarantees.

## Problems found and fixed

Earlier checks caught a logo accessible-name mismatch, text-enlargement grid overflow, missing favicon, and lack of public HTML without JavaScript. These were corrected with matching visible labels, shrinkable layout children, a favicon and prerender/hydration. Saved XML preview was added to the Java lab and tested after restarting its server. WebKit's Windows Tab-cycle difference is documented and its skip-link activation tested explicitly.

## Limits

This record does not claim a human screen-reader session, real mobile Safari/Android testing, an actual Photoshop session, a licensed Cascade instance, applicant eligibility or production field Core Web Vitals. Read the CI result for the latest full three-engine outcome rather than assuming configuration equals completion.

Local Chromium/WebKit result: 26 browser scenarios passed after the fixes. Public-mode Lighthouse verified accessibility 100, best practices 100 and SEO 100; its measured performance score and metrics are in the report. These are lab scores, not conformance or field ranking claims.

The GitHub Pages subdirectory smoke check passed for /Web_GA_Demo/: prerender, hero image, content studio and Alpine guide, with no page JavaScript errors. Public-mode mobile Lighthouse measured performance 89, accessibility 100, best practices 100 and SEO 100; LCP 2.1 seconds and CLS 0. Palette tests cover focus, form boundaries, status badges and text. Dark-surface focus outlines were corrected to cream. Full reports are lab evidence, not field guarantees.
