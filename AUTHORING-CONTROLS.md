# Course authoring controls

Based on forma-studio-test commit 2d282709b60da0aee99337c917334da8b12b48ab.

Implemented individual text/quiz lesson and chapter regeneration. Replacement shape must match the target; attachments and unrelated lessons remain intact. YouTube lessons are preserved during chapter regeneration. Model responses still pass complete outline validation. Course changes during generation prevent application of stale results.

Added course preview and public publish/unpublish controls. The public viewer receives only titles, lesson type and content. PDF identifiers, names and owner identity are withheld from public responses. Drafts are visible only to the owner. Unpublishing makes anonymous viewing return 404. This is public free-course publishing, not enrollment-restricted learning. The editor explicitly explains this before publication.

Added privacy-enhanced YouTube embeds and a shared HTTPS URL parser for watch, shorts, embed and youtu.be URLs. CSP permits frames only from www.youtube-nocookie.com. User-entered content renders as text nodes, not HTML.

Validation: npm ci succeeded (zero reported vulnerabilities); npm test passed 17 tests, zero failed. Includes portfolio regression, regeneration preservation and mismatch rejection, YouTube hostile-host/scheme rejection, publication owner/anonymous rules, and unpublication. Syntax checks and whitespace check passed. Hosted verification is recorded separately after deployment.

No migration is required: published already exists. No production, Google OAuth scope, billing, or payment changes. Drive/OAuth, student enrollment, submissions and grades remain subsequent work.
