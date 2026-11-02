# Design rationale and interview walkthrough

Audience: prospective students scanning an academic page and campus editors making small content changes. The warm paper background, deep red masthead, editorial headings, numbered feature cards, and generated studio concept image establish a university context without copying SEMO's identity.

The landing page offers a clear primary action and a second path into the editor workflow. On narrow screens the two-column hero and studio stack; cards become a single column. The content queue uses text statuses and action labels, not color alone. Native controls and disclosures reduce interaction complexity. Form length limits constrain accidental oversized requests.

## Five-minute demo

1. Explain the independent, fictional scope. Show the responsive program page and keyboard skip link.
2. Open Content studio, submit a sample departmental edit with a target page field and replacement text, and explain browser-only storage.
3. Submit it for review, request changes, resubmit, approve, publish, and inspect the timestamped audit history. Open the program page to verify the text change. Refresh to show persistence.
4. Open Editor guide and operate the Alpine disclosure with Enter. Explain why Alpine and React own separate DOM trees.
5. Show the Cascade XML/Velocity contract and integration boundary, run the tests, and explain which accessibility and Photoshop checks still need human evidence.

## Improvements after user research

Interview a student and editor separately. Observe whether they understand the main action and ticket status. Record task completion, confusing labels, and keyboard barriers. Prioritize changes from evidence; no user study has been conducted for this demo.

Real deployment would need authenticated roles, server-side workflow validation, concurrency handling, content versioning, staging previews, durable audits and API error recovery. The current localStorage state machine deliberately models only the sequence of work and local publication of three plain-text fields.

