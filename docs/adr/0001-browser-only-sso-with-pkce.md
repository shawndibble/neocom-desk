# 0001 — Browser-only EVE SSO via PKCE; tokens never leave the device

## Status
Accepted (2026-08-29)

## Context
NeoCom Desk is a static SPA on GitHub Pages. EVE SSO supports the OAuth2
authorization-code flow with PKCE for public clients, and both
login.eveonline.com's token endpoint and esi.evetech.net serve
`Access-Control-Allow-Origin: *` (verified 2026-08-29). A backend proxy for
auth is therefore optional, not required.

## Decision
Authenticate entirely in the browser with PKCE. Store refresh tokens only in
the device's IndexedDB. The Firebase backend exists solely to sync editable
data (plans, settings); it never sees ESI tokens. Each device performs its own
SSO login per character.

## Consequences
- No server holds keys to any character's API data; smallest possible attack
  surface for a hobby-scale free service.
- XSS is the residual risk for on-device tokens; mitigated by no third-party
  scripts and a strict dependency policy.
- New devices require re-login per character (accepted in design review).
- Confidential-client flow is impossible from the browser (CORS blocks the
  Authorization header) — irrelevant under PKCE.
