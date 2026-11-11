# Short link proxy Worker

Puts the `shortStartLink` Firebase function (`functions/src/shortStartLink.ts`)
behind our own address, `https://api.neocomdesk.com/short`, so the
`cloudfunctions.net` address is never shown or called by the app. It serves only
`/short`, passes `GET` (query string) and `POST` (JSON or form body) through to
the function and returns the function's answer, status and `Retry-After`
unchanged, and answers the CORS preflight itself (any origin: a script has none).

## Who is calling

The function limits new short links per caller (an IP, hashed). From here every
request reaches it from Cloudflare, so the Worker tells it who the caller is in
`x-short-link-client` (`cf-connecting-ip`) and signs that with a shared secret in
`x-short-link-proxy`. The function believes the claim only when the secret
matches `SHORT_LINK_PROXY_SECRET` in `functions/.env`; anyone calling the function
directly is identified by their own address. The Worker rebuilds the headers it
sends, so a caller can't pass either one through.

## Setup (Shawn)

Pick one long random secret (for example `openssl rand -hex 32`) and use it twice.

1. Function side: add `SHORT_LINK_PROXY_SECRET=<secret>` to `functions/.env`
   (gitignored), then redeploy:

   ```
   FUNCTIONS_DISCOVERY_TIMEOUT=120 FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH=true \
     npx firebase deploy --only functions:shortStartLink --project neocom-desk
   ```

2. Worker side:

   ```
   cd workers/short-link-proxy
   npx wrangler@4 secret put PROXY_SECRET     # paste the same secret
   npx wrangler@4 deploy
   ```

`wrangler deploy` creates the `api.neocomdesk.com` DNS record and certificate (a
custom domain in `wrangler.toml`; Cloudflare manages the zone). The address is
`SHORT_LINK_ENDPOINT` in `src/features/survey/shortStartLink.ts`.

Check it:

```
curl -i -X POST https://api.neocomdesk.com/short -H 'Content-Type: application/json' -d '{"rate":500}'
```

answers `400 {"error":"rate must be a number from 0 to 100"}`.
