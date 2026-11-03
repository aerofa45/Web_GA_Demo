# Forma Studio staging QA — November 2, 2026 (America/Chicago)

Scope: only `forma-studio-test` in `aerofa45/Web_GA_Demo`, Render service `srv-dbkenbjbc2fs739598u0` at https://web-ga-demo.onrender.com, and Supabase `Forma_Trial_Test` (`hqvkpejpykojedjrmdjs`). Production was not modified. No live Stripe API operations or real payment details were used.

## Fixes

- Public course responses now preserve the validated saved theme. Previously the learner always fell back to Midnight even when the instructor saved Forest or Daylight.
- Instructor classwork previews disable student submission and completion actions; the backend continues to reject instructor attempts at those student-only operations.
- Versioned learner script URLs so existing browser sessions receive the updated classwork UI instead of cached scripts.
- Repaired incomplete enrollment test fixtures and corrected scoped OAuth discovery expectations: the test requests no `portfolio:write` permission, so nine tools are correct; portfolio write tools must remain absent.

## Automated results

`npm test`: **48 passed, 0 failed** (seven additional tests after the original 41). These are in-memory application tests, not proof of real Google or Stripe operations.

New regression coverage exercises published theme propagation without leaking attachment identifiers; signed payment validation (bad signatures, stale signatures, live-mode events, amount mismatch and replay); separate instructor approval; paid enrollment gating; failed Drive permission grants; successful grant/revocation; full-refund entitlement revocation; immediate LMS denial when Drive removal fails; idempotent cleanup retries; retaining a permission shared with another course; and preserving a second paid order. An approved-student scenario covers submission, duplicate rejection, quiz answer-key hiding, attempt limits, grading, notifications, isolated progress and another student's data isolation.

The deployed anonymous staging E2E script passed: workspace/assets, OAuth metadata, invalid token rejection and anonymous API protection.

## Real staging and browser results

- Render service identity, repository and branch verified through connected Render tools.
- Authenticated sign-in succeeded using the secure browser credential prompt.
- Instructor Midnight, Daylight and Forest previews changed the rendered theme and URL.
- Lesson navigation and keyboard tab switching worked. Classwork empty states rendered. After rollout in the same browser session, the instructor preview heading and disabled completion controls were visibly verified.
- A non-owner URL override (`?theme=daylight`) could not replace the saved Forest theme.
- The existing instructor Google connection opened the real Drive picker; its cookie/storage access prompt was left untouched after approval review blocked acceptance.
- A separate fictional QA instructor and student were registered through the application API. No existing user password or role was altered.
- An isolated two-lesson QA course was published with Forest. The deployed API returned Forest to a non-owner; preview controls were hidden in the learner browser view.
- A **$1.00 USD test payment** completed in Stripe Checkout's explicitly labelled sandbox, redirected to staging success, and the real webhook changed the matching database order from `pending` to `paid`.
- Payment did not create an enrollment or grant access. A real unverified student was denied enrollment requests and LMS access (403), instructor course access (403), and enrollment decisions (403). The instructor could not approve an email without an enrollment request (404).
- Supabase inspection found RLS enabled on all 30 application tables. Security advisor findings were informational “RLS Enabled No Policy”, consistent with this server-only service-role design; this is not a full security audit.

## Genuine blockers

1. **Google authentication deferred:** The user approved student email/profile verification, but Google rejected the supplied password and the user no longer remembers that Google password. The second LMS account itself signed in successfully. At the user's request, Google-dependent tests are paused. Real approved-student UI and provider-level Drive playback/grant/removal remain unverified. The separate Drive picker cookie/storage prompt is also untouched. No verification row was fabricated and no permission boundary was bypassed.
2. **Real subscription checkout and previously approved enrollment revocation:** these still require Google student verification. The Stripe sandbox connection and real one-time refund webhook blocker are now resolved; see the final follow-up below. Real revocation of an already approved student's LMS/Drive access remains unverified.

## Test fixture and continuation

QA course: `bbb170aa68a38ae68ab17d5db6da1cb5094535f54c09a169`.
QA student: `8e632b989fd77431f0c345425aa27750c6d644381815628c`.
QA instructor: `e32cd71a8d894d790b17a11434b3d783aa8aa8e9b9fe5ab6`.
Stripe test Checkout session: `cs_test_a1HWxAXE5bJKK4jyM4fSg2ZDddoGKSRuejwOTydNFTTcQSW2jOSFKuGqII`.

The isolated fictional QA course remains available; both QA test orders are now fully refunded. The earlier theme/UI application code was verified live at `8854e56071a791c8e22636d244bfb82c1eccf7b6`; all three regression workflows for that commit passed. The anonymous staging OAuth E2E check passed after the theme change. No credentials, cookies, provider tokens or encryption keys are included in this report or committed to the repository.

## Follow-up: checks without Google authentication

Completed with the second real LMS account in Cloud Browser:

- Another instructor's private draft/editor endpoint returned `Course not found`.
- The private gradebook returned `Approved course enrollment required`.
- The enrollment endpoint returned only this viewer's `status: none`, rather than the instructor's enrollment list.
- The QA course's paid order was absent from this second account's payment history (`orders: []`).

Seven additional automated tests exposed four application issues, all fixed:

- Subscription-priced course approval now requires a paid order or active subscription. Pending subscriptions do not qualify. Google verification and instructor approval remain required.
- Cancellation/inactive subscription events revoke LMS enrollment when no other paid entitlement remains, and use the same retryable Drive cleanup as refunds.
- Refunding one order preserves access when a separate active subscription remains; cancellation likewise preserves a separate paid order.
- Quiz attempts reject negative or out-of-range option indices without consuming an attempt.

Additional cases verify stale subscription events against current Stripe API state, reject live or unverifiable subscription responses, process asynchronous paid subscription checkout without automatic enrollment, and limit failed/expired checkout updates to pending orders. All provider calls in these new automated cases are test doubles; no Google login or live Stripe was used.

At this earlier stage, the real Stripe refund test was blocked by the mismatched connected sandbox. This was subsequently resolved as recorded below.

### Post-deployment verification of the follow-up

Render confirmed commit `0889f7e46e0970f1a1724dc6582b23d2d4ae54d4` live on the staging service. All four GitHub workflows for that commit passed (three regression workflows plus deployed OAuth smoke).

An additional authenticated hosted run passed **19 checks** with the existing fictional QA instructor/student accounts, using only LMS sessions and no Google authentication. It verified account roles and no admin role; owner reads; rejection of student course reads/edits/archival, pricing changes, enrollment approval, gradebook reads, submissions and lesson completion; per-student order history and enrollment status; cross-origin save denial; anonymous denial; unsigned webhook denial; disabled live-payment routes; and unchanged instructor course data after denied operations.

An earlier refresh still exposed `acct_1UXUYxHOgobCVQyb` and returned `No such checkout.session`. The subsequent connection and refund retest below supersede that blocker.


## Final follow-up: correct sandbox and real refund webhook verified

The newly added Stripe connection exposes **EDU_INT sandbox**, account `acct_1UXJ3tHVLY9TNyPY`, with `livemode: false`. The existing staging Checkout session was successfully retrieved. All subsequent provider operations used that exact sandbox and test mode.

The first $1.00 test payment was fully refunded in Stripe (`re_3UXYyjHVLY9TNyPY0AjwOOd8`, succeeded). Inspection found that the staging webhook endpoint `we_1UXUwfHVLY9TNyPYMsA1r7ey`, targeting `https://web-ga-demo.onrender.com/api/stripe-test/webhook`, was missing refund and subscription lifecycle events. Its existing event subscriptions were preserved and these were added:

- `charge.refunded`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The initial refund occurred before the refund event subscription was corrected, so that isolated QA order (`bc456f84286862ee170642c289f4bdce8c60f0b80afcedab`) was manually reconciled from paid to refunded after verifying Stripe's successful full refund. This initial database transition is not claimed as a webhook result.

A **fresh end-to-end retest then passed without any manual database update**:

1. The QA student created a new $1.00 USD staging Checkout session and paid through Cloud Browser using Stripe's public test card in the explicitly labelled sandbox.
2. Checkout returned to the staging QA course; Stripe reported paid and the actual payment webhook updated the matching order to paid.
3. A full $1.00 refund succeeded through the connected sandbox.
4. The actual refund webhook changed that fresh Forma order from paid to refunded.
5. The student's order-status API returned refunded. The unenrolled student's gradebook request still returned HTTP 403, `Approved course enrollment required.`

Evidence identifiers:

| Item | Identifier |
| --- | --- |
| Fresh Checkout | `cs_test_a1fLd6hxgbxmgRWHqOFeIY4iCQxOJN97l60nXV3qk7kqiu0PFKkSALN8yf` |
| Fresh order | `e106ba5507673f2a59ee1470f5f501f5806b3636ed449af2` |
| Payment intent | `pi_3UXZf2HVLY9TNyPY0GKfua41` |
| Successful full refund | `re_3UXZf2HVLY9TNyPY0MZZawPg` |
| Refunded charge | `ch_3UXZf2HVLY9TNyPY0V9JaQzi` |

This verifies real sandbox payment/refund processing and continued denial to an unenrolled student. It does **not** verify revocation of previously approved enrollment or actual Google Drive permissions: the QA student never had approved enrollment or a verified Google identity. Those provider-level checks, approved-student UI, and real subscription checkout remain paused pending Google authentication. The corresponding application logic has automated coverage.

No application source changed in this final follow-up. The previously verified 48 automated tests, 19 authenticated hosted isolation checks and four passing workflows remain the application validation baseline. Only the staging sandbox webhook configuration and isolated QA test data changed. Production and live Stripe were untouched.
