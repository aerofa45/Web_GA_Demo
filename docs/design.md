# Design rationale 

Audience: prospective students scanning an academic page and campus editors making small content changes. The warm paper background, deep red masthead, editorial headings, numbered feature cards, and generated studio concept image establish a university context without copying SEMO's identity.

The landing page offers a clear primary action and a second path into the editor workflow. On narrow screens the two-column hero and studio stack; cards become a single column. The content queue uses text statuses and action labels, not color alone. Native controls and disclosures reduce interaction complexity. Form length limits constrain accidental oversized requests.


Real deployment would need authenticated roles, server-side workflow validation, concurrency handling, content versioning, staging previews, durable audits and API error recovery. The current localStorage state machine deliberately models only the sequence of work and local publication of three plain-text fields.

