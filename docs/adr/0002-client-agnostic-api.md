# Worker API is client-agnostic (no browser-specific coupling)

**Status**: Accepted, active — affects implementation now.

**Decision**: The Worker API returns pure JSON exclusively. No `Set-Cookie` headers, no HTML responses, no browser-specific redirect flows (e.g., OAuth callback redirects from the Worker). Every endpoint must be consumable by a plain HTTP client — browser, React Native/Expo, or any other future client — without changes to the API shape.

**Why**: The first client is a React web app, but React Native (Expo) is a planned future client. Browser-specific patterns (cookies, redirects) are cheap to avoid now and expensive to retrofit later. Pure JSON endpoints work identically across platforms.

**Consequences**:

- Authentication uses `Authorization: Bearer <JWT>` headers only — no session cookies.
- OAuth flows (Google login) are handled entirely by the Supabase Auth SDK on the client — the Worker never participates in redirect flows.
- Signed R2 media URLs use plain HTTPS `GET`/`PUT` — already platform-agnostic.

**Considered alternative**: Use `Set-Cookie` for session management (simpler for web, standard browser auth) — rejected because it would break React Native clients and require a separate auth path.
