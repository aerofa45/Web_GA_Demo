# Connect ChatGPT to Forma Studio (staging)

## Existing identity and OAuth

This connector reuses Forma Studio's account sign-in and the staging Supabase project.
It does **not** use Google login as the ChatGPT connector's identity provider,
and it does not need users to paste passwords, API keys or service-role secrets into ChatGPT.
Each user signs in to their own Forma Studio account on the official staging domain
and explicitly approves scoped OAuth access.

- MCP server: https://web-ga-demo.onrender.com/mcp
- Protected-resource metadata: https://web-ga-demo.onrender.com/.well-known/oauth-protected-resource
- OAuth authorization-server metadata: https://web-ga-demo.onrender.com/.well-known/oauth-authorization-server
- OAuth mechanism: authorization code + PKCE (S256), public client dynamic registration,
  bearer access token, refresh-token rotation, revocation.
- Available scopes: `portfolio:read`, `portfolio:write`, `course:read`, `course:write`.
- No administrator scope exists. A student cannot gain instructor course-edit permissions from OAuth.
- Connector writes require instructor/user confirmation in ChatGPT **and** preview hashes or version checks in the backend.

## Connect in an eligible ChatGPT workspace

As of November 2026, full custom MCP write tools are available on supported
Business and Enterprise/Edu workspaces; do not assume that a personal Plus
account supports the same capability. Confirm current eligibility in OpenAI's documentation.

1. Open ChatGPT on the web, then **Plugins**.
2. Choose **+** → **Add custom MCP server**, if your account/workspace allows it.
3. Name it `Forma Studio Staging` and enter
   `https://web-ga-demo.onrender.com/mcp` as the public HTTPS server URL.
4. Choose OAuth authentication. Forma Studio publishes discovery metadata and
   dynamic client registration. Do not enter the Supabase service-role key.
5. Review the requested scopes, accept the risk notice, create the plugin,
   and use the redirected Forma Studio sign-in to approve account-level consent.
6. Confirm the discovered tools include `list_my_resources`,
   `preview_new_course`, `create_course_draft`,
   `preview_assessment_batch`, and `create_assessment_batch`.
   If tools were added after the plugin was created, use **Refresh tools** in
   the connection management UI if available.
7. In a ChatGPT conversation select the Forma Studio plugin and ask:
   "Show the courses in my Forma Studio staging account."
   Then ask: "Draft a 6-week probability course, show the preview and
   ask me before saving it." You must approve the proposed write.

Official reference:
https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## What works in the application independently of ChatGPT

Visit https://web-ga-demo.onrender.com/assistant-workspace after logging in:

- Describe portfolio/course changes in natural language (uses the **separate
  Gemini configuration**, not ChatGPT) or use structured editing controls.
- Preview and explicitly approve edits, then inspect audit history.
- Upload a private PDF to an instructor-owned course and generate a proposed
  outline from notes/PDF; review and confirm the save.
- Generate LMS assignments and MCQ quizzes from the **saved course material**;
  inspect answer keys, then approve atomic creation.
- Review and restore previous snapshots of portfolio or course content.
- Instructors and students have distinct privileges.

## Tests and limits

CI test suite exercises OAuth authorization, PKCE, refresh/revoke, token
and course ownership, preview/hash mismatch, assessment save/replay, and
version restores through local mocked API/database integrations. Successful
CI is not equivalent to successful external ChatGPT account linkage,
live Gemini generation, live PDF processing, Google Drive grants or
end-to-end real-browser acceptance testing.

No production data, production branch or real payment configuration is
changed by this staging integration. Do not publish the app to users or
enable actual paid enrollment before a separate release/security review.
