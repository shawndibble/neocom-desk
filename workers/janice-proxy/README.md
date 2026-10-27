# Janice proxy Worker

Appraisal's "Open in Janice" posts the pasted text here; the Worker adds the
Janice API key (`X-ApiKey`), creates the appraisal and returns its link.
Janice's API needs a key per caller, and a key shipped in the browser bundle of
a public repo is a leaked key, so the key lives only in this Worker.

Guards (the key is shared): only our origins, 10 requests a minute per IP
(`LIMITER` in `wrangler.toml`), and bodies over 50 KB are refused.

## Setup (Shawn)

```
cd workers/janice-proxy
npx wrangler@4 secret put JANICE_API_KEY
npx wrangler@4 deploy
```

The Worker answers at `https://janice.neocomdesk.com` (a custom domain in
`wrangler.toml`; Cloudflare manages the zone), which is `JANICE_PROXY_URL` in
`src/features/market/janice.ts`.

## Janice markets

`HUB_MARKETS` in `janiceProxy.mjs` maps Trade Hub ids to Janice market ids.
Read the list with the key:

```
curl -s -H "X-ApiKey: $JANICE_API_KEY" https://janice.e-351.com/api/rest/v2/markets
```
