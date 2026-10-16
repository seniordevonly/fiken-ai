# Tech Debt

Known issues that are deliberately deferred. Each entry says what is wrong, why it matters, and what a fix looks like.

## OAuth authorization code flow is not a real authorization step

**Where:** `fiken-mcp/src/index.ts`: `GET /oauth/authorize` handler and `handleOAuthToken` (`grant_type=authorization_code`)

**Problem**

1. **Open redirect, no user consent.** `GET /oauth/authorize` issues a code and `302`s to whatever `redirect_uri` the caller supplies. It never authenticates anyone or checks the `client_id`, and there is no allow-list of redirect URIs. Anyone can use the server's hostname as a trusted-looking redirector, e.g. `/oauth/authorize?response_type=code&client_id=x&redirect_uri=https://evil.example`.
2. **Authorization codes are not validated.** The token endpoint accepts any `code` that starts with `auth_`. Codes are not stored, are not single-use, never expire, and are not bound to the `client_id` or `redirect_uri` they were issued for. No PKCE (`code_challenge`/`code_verifier`).
3. **`client_secret_basic` is advertised but not implemented.** Every discovery document lists `token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic']`, but `handleOAuthToken` only reads `client_id`/`client_secret` from the request body. A client that sends `Authorization: Basic …` gets `401 invalid_client`.

**Impact**

Tokens are still gated by the client secret (`validateOAuthCredentials`), so this does not hand out access tokens on its own. The authorization code step adds no security beyond the client secret. The open redirect can be used for phishing from our domain.

**Fix outline**

- Keep an allow-list of redirect URIs (env var, e.g. `OAUTH_REDIRECT_URIS`) and reject anything else with `400` before redirecting. Require a known `client_id`.
- Issue codes as short-lived (≈60 s), single-use values bound to `client_id`, `redirect_uri` and an optional PKCE `code_challenge`. Either keep them in an in-memory map or HMAC-sign them like access tokens. On exchange, verify all bindings and the `code_verifier`.
- In `handleOAuthToken`, parse `Authorization: Basic base64(client_id:client_secret)` when present. Otherwise remove `client_secret_basic` from the discovery documents.
- Test against ChatGPT's connector flow before deploying, since that is the only OAuth client in use (Hermes uses the static `MCP_AUTH_TOKEN`).

**Related cleanup:** the six `.well-known` discovery handlers are copy-pasted and already disagree (some lack `authorization_endpoint`). The dead `initialize` branch in `processMcpRequest` hardcodes an old issuer (`fiken-ai.regnmedoss.no`). Build the discovery JSON from one helper while fixing the above.
