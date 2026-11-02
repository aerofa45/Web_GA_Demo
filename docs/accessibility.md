# WCAG 2.1 AA assessment

Scope: the public program page, content studio view, and Alpine editor guide. The standalone Java lab is an educational development tool and is not included in a public-site conformance claim. **No complete WCAG conformance claim or certification is made.**

## Implemented and tested

- Semantic landmarks, headings, native form labels and validation, descriptive titles and document language.
- Skip link and keyboard activation; keyboard-only ticket submission; deliberate heading focus after changing view.
- Axe WCAG 2 A/AA and 2.1 A/AA rules on program, studio and guide states. Raw results, including items needing review, are saved in `evidence/accessibility-*.json`.
- 320 CSS px reflow with 200% root text enlargement and WCAG text-spacing overrides together. An overflow bug was found, corrected with shrinkable grid/flex children, and retested.
- Forced-color and reduced-motion emulation; no flashing content, autoplay, animations, timers or drag-only interactions.
- Public content and guide readable without JavaScript in the production build.
- Text status labels, generated-image description, decorative artwork hidden from accessibility APIs, visible focus and no custom keyboard traps.

## Criterion coverage review

“Reviewed” is a code/content inspection or targeted test, not a declaration that every assistive-technology combination passes. Browser engines and counts are recorded separately in the validation record.

| WCAG criteria | Evidence / applicability |
| --- | --- |
| 1.1.1 Non-text content | Hero describes the scene and generated nature; decorative CSS/mark hidden; alt checks + content inspection |
| 1.2.1–1.2.5 Media alternatives/captions/audio description | Not applicable: no audio or video |
| 1.3.1 Information and relationships | Labels, headings, lists, dl, landmarks; axe and saved accessibility trees |
| 1.3.2 Meaningful sequence | DOM order follows visual reading order; tree/content inspection |
| 1.3.3 Sensory characteristics | Instructions name controls/statuses, not just position, shape or color |
| 1.3.4 Orientation | Responsive layout and no orientation lock; viewport tests |
| 1.3.5 Input purpose | No personal-information fields; ticket fields have explicit labels |
| 1.4.1 Use of color | All workflow states and actions have text labels |
| 1.4.2 Audio control | Not applicable: no audio |
| 1.4.3 Contrast (minimum) | Axe scans rendered text; raw review items retained |
| 1.4.4 Resize text | 200% root text test, with narrow viewport and spacing overrides |
| 1.4.5 Images of text | Essential interface/program text is HTML; generated scene is supplementary |
| 1.4.10 Reflow | 320px program and studio assertions; grid overflow corrected |
| 1.4.11 Non-text contrast | Deliberate input borders and 3px focus outline; forced colors test; 13 palette contrast assertions cover text, focus and boundaries; further real-device state review still useful |
| 1.4.12 Text spacing | line-height 1.5, paragraph spacing 2em, letter spacing .12em and word spacing .16em applied together |
| 1.4.13 Content on hover/focus | No custom hover-only popovers or tooltips |
| 2.1.1 Keyboard | Keyboard-only form flow, native disclosures, skip activation and workflow controls |
| 2.1.2 No keyboard trap | No modal focus trap or nested app keyboard handler; native controls |
| 2.1.4 Character shortcuts | No app-specific single-character shortcuts |
| 2.2.1 Timing adjustable | No time limits or sessions that expire |
| 2.2.2 Pause/stop/hide | No moving/auto-updating presentation content |
| 2.3.1 Three flashes | No flashing content |
| 2.4.1 Bypass blocks | Skip to main; Chromium checks Tab discovery; WebKit explicitly focuses before activation |
| 2.4.2 Page titled | Distinct website and guide titles |
| 2.4.3 Focus order | DOM sequence and keyboard test; view changes focus the new h1 |
| 2.4.4 Link purpose | Human-readable action/link text in context |
| 2.4.5 Multiple ways | Header/footer guide navigation plus public section links; sitemap for configured deployment |
| 2.4.6 Headings and labels | Descriptive, nested headings and explicitly labeled controls |
| 2.4.7 Focus visible | 3px outline with offset; heading focus retained |
| 2.5.1 Pointer gestures | No multipoint or path-based gestures required |
| 2.5.2 Pointer cancellation | Native click controls fire on completed activation; no pointerdown actions |
| 2.5.3 Label in name | Visible labels used as accessible names; earlier logo mismatch corrected |
| 2.5.4 Motion actuation | No device-motion inputs |
| 3.1.1 Language of page | `lang=en` |
| 3.1.2 Language of parts | English content; no multilingual passages |
| 3.2.1 On focus | Focus alone does not change page or submit forms |
| 3.2.2 On input | Selects do not submit requests; explicit submit/transition actions |
| 3.2.3 Consistent navigation | Same header/footer on program/studio; guide has clear return link |
| 3.2.4 Consistent identification | Same wording/style for repeated controls |
| 3.3.1 Error identification | Native required checks and explicit whitespace validation status; tested |
| 3.3.2 Labels/instructions | Persistent visible labels, request examples, local-only notice |
| 3.3.3 Error suggestion | Validation names the missing content to provide |
| 3.3.4 Error prevention (legal/financial/data) | No legal/financial transaction; staged review before local text publication; original seed recoverable |
| 4.1.1 Parsing | React-generated valid structure and native HTML inspection; no duplicate ID issues in axe |
| 4.1.2 Name/role/value | Native controls, pressed/expanded states and axe/tree evidence |
| 4.1.3 Status messages | Polite `role=status` updates after submissions/transitions; tree inspection |

## Remaining verification

Run NVDA with Firefox or VoiceOver with Safari to listen to actual output for navigation, forms, errors, status announcements and details disclosures. Inspect real OS high-contrast settings and zoom at 400% on a 1280px-wide display. Check focus, borders and selected/hover states with a contrast tool. Include an editor/student with disabilities in a usability session if possible. Record browser/AT versions, tasks, findings and retests.

The saved accessibility tree can be reviewed for semantics, but is not a recording of screen-reader speech. Firefox's local Windows executable failed to launch; Linux CI is configured to run it. WebKit engine testing is not equivalent to testing Safari on an actual iPhone or Mac.

References: [WCAG 2.1](https://www.w3.org/TR/WCAG21/) and [W3C conformance guidance](https://w3c.github.io/wcag21/understanding/conformance).
