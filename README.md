# Neocom Desk

Installable PWA companion for EVE Online: multi-character
overview, skill planning with remap optimization, industry build planning,
a market browser, planetary industry, corp tools, and notifications.

Live: https://neocomdesk.com

## Features

- **Characters** — EVE SSO (PKCE) sign-in, many characters side by side,
  per-character overview with training queue summary.
- **Skills** — trained skills, attributes/implants, clones, in-game queue.
  **Skill Plans**: drag-and-drop entries with prerequisite auto-insert,
  milestones, in-game queue import, clipboard import/export, and an
  optimizer aware of remaps, implants ("what-if" overrides), and sequenced
  cerebral accelerators. Ship mastery, fit check, and a side-by-side
  character comparison.
- **Industry** — Build Plans for manufacturing and reaction jobs:
  blueprint/formula search, materials, job fees and taxes, facility presets
  (NPC stations and player structures with rig bonuses), build-vs-buy and
  sale-profitability verdicts against live trade hub prices, sub-builds,
  a production log, opportunities, and an active jobs panel.
- **BPC sourcing** — search every publicly contracted blueprint copy by
  ME/TE, runs, price, region and jump range, flagging BPOs that may beat it.
- **Ships** — build a Fitting against a ship's real skills/implants (DPS,
  tank, EHP, cap stability, against a damage/target profile you set), save it
  to My Fittings with a share code, and compare fits side by side. The Ship
  Tree maps every hull by faction, map or ladder view, flagging which you can
  fly.
- **Market** — item price lookup at any region or all regions: SDE-backed
  search, jump-range and security filters, a quickbar of saved items,
  side-by-side compare, live order books, price history, price alerts, an
  Appraisal of pasted items or EFT fits (net of fees, with LP store
  acquisition), and Hauling Opportunities ranking routes by expected profit.
- **Open Orders** — every character's market orders filed under what is
  wrong with them (undercut, below the relist floor, expiring), with each
  exit priced net of fees.
- **Mining** — mining overview (output, ISK/hr, raw vs refined) and a moon
  rental tax ledger: payees, assignments with snapshotted tax, and payment
  matching.
- **Planetary Industry** — colony list with extractor/factory pins and
  expiry warnings, a chain planner (sourcing floor, planet/pin layout,
  customs rate, margin and CPU/powergrid footprint), and an advisor.
- **Character data views** — wallet and loyalty store, assets, mail,
  calendar, contracts, and contacts, cached locally and viewable offline once loaded.
  Read-only except replying to/forwarding mail, marking mail read, and
  calendar RSVPs.
- **Corp tools** — role-gated ops board (structures, moon extractions),
  vitals, member roster, corp assets and wallet, for characters holding the
  relevant in-game roles.
- **Notifications** — in-app feed plus scheduled/foreground-polled alerts
  for skill training, industry jobs, planetary extraction, mail, market
  orders, contracts, wallet changes, and calendar events.
- **PWA** — installable to home screen/desktop, with an update prompt and a
  one-time install call-to-action. Character data and skill plans work
  offline; market, killboard, and first-time large data
  files need a connection.

## Architecture

- Static browser SPA (React 19 + TypeScript + Vite), hosted on GitHub Pages
  (production) and Cloudflare Pages (the `develop` preview) — no app server.
- EVE SSO with PKCE straight from the browser. Refresh tokens never leave
  the device (stored in Dexie only).
- Local-first: all API-derived data (skills, wallet, assets, mail, ...) is
  cached in IndexedDB (Dexie) per device, never synced. Editable data
  (Skill Plans, Build Plans, synced settings) is created in-app and synced
  cross-device through Firebase (Firestore + one Cloud Function) at
  free-tier scale — Firebase exists only for this sync path and never sees
  EVE tokens beyond one short-lived access token per sign-in.
- Market prices from Fuzzwork aggregates, with ESI as fallback. The
  item/skill/blueprint catalog (SDE) is snapshotted at build time into
  slim JSON (`npm run sde:build`) — no SDE calls at runtime.

See `GLOSSARY.md` (glossary), `docs/context/decisions/` (scope decisions),
`docs/ARCHITECTURE.md` (module map, data flows, feature inventory),
`docs/DESIGN.md` (design system), `docs/adr/` (architecture decisions).

## Development

**Do all work in a git worktree, never in this main checkout.** The main
checkout is reserved for manually running/testing the app in a browser
(`npm run dev`); every code change belongs in a sibling worktree so it
doesn't race whatever else is running here. See `CLAUDE.md`.

```sh
npm install
npm run dev        # dev server
npm test           # vitest watch
npm run typecheck
npm run lint
```

`npm install` also sets up a pre-commit hook (husky + lint-staged) that
auto-fixes lint/format on staged files and runs `typecheck` on every commit —
but that setup step is silently skipped if `ignore-scripts` is set in your
npm config (`npm config get ignore-scripts`). After a fresh clone or `npm
ci`, run `npm run verify-hooks -- --fix` once to install the hook and
confirm it's actually live; it fails loudly instead of pretending to work.

While iterating, prefer narrow checks over the full suite: `npm run
typecheck` and `npx vitest run <path>` for the file(s) you're touching.
**Never run `npm run test:run` or `npm run build` locally** — CI's
`validate` job runs lint, format check, typecheck and build on every PR, a
`test` job runs the unit suite across four shards, and an `e2e` job runs
Playwright across four more; that's the gate, not a local pre-PR run.

Copy `.env.example` to `.env` and fill it in — see
[Run your own copy](#run-your-own-copy) for where each value comes from.

## Run your own copy

This is everything needed to fork the repo and get a working site of your own.
Only step 1 is needed to run locally; steps 2 to 4 add sync, push alerts and
hosting. The values that point at the original deployment are listed below, in
steps 2 to 4 and "What a fork does not get".

You need Node 24, a GitHub account, an EVE account, and a Google account for
Firebase.

### 1. Register an EVE application and run locally

1. Create an application at https://developers.eveonline.com with
   **Authentication & API access**. Enable the ESI scopes the app requests
   (the list is built from `src/esi/registry.ts`; enabling all of them is the
   simplest choice).
2. Add callback URLs. The app uses PKCE with no client secret, and builds the
   callback from the page origin: `http://localhost:5173/callback` for
   development, and `https://<your-domain>/callback` for production. A callback
   belongs to one application, so a separate dev or preview site needs its own
   EVE application.
3. Fork and clone, then:

   ```sh
   npm ci
   npm run verify-hooks -- --fix
   cp .env.example .env     # set VITE_EVE_CLIENT_ID
   npm run dev
   ```

With only `VITE_EVE_CLIENT_ID` set you get sign-in, every character view,
skill plans, build plans and the market, with data cached on the device.
Leave the other variables blank: Firebase sync and Sentry switch themselves off.

### 2. Firebase: cross-device sync, push alerts and corp tools

Firebase holds Skill Plans, Build Plans and synced settings, plus the Cloud
Functions behind push alerts, the Corp Tax Book, SRP and community features.
It never receives a refresh token except the opt-in grants listed in
`CLAUDE.md`. Full detail is in `docs/SYNC-SETUP.md`.

1. Create a Firebase project and upgrade it to the **Blaze** plan (Cloud
   Functions v2 requires it; hobby use stays inside the free quotas).
2. Enable **Authentication** (Get started; no provider is needed, since sign-in
   uses custom tokens) and create a **Firestore** database in production mode.
3. Add a **Web app** under Project settings and copy its config into `.env`:
   `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`,
   `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`. For push notifications also
   generate a Web Push key pair (Project settings, Cloud Messaging) and set
   `VITE_FIREBASE_VAPID_KEY`. `VITE_FIREBASE_MEASUREMENT_ID` (Google Analytics)
   and `VITE_SENTRY_DSN` are optional; leave them empty to disable both.
4. Point the CLI at your project: edit `.firebaserc` and replace
   `neocom-desk` with your project ID (or run `firebase use --add`).
5. Tell the functions which EVE applications they trust. Create
   `functions/.env` (gitignored):

   ```sh
   # comma-separated: every EVE application client ID that signs users in
   EVE_CLIENT_ID=<dev client id>,<prod client id>
   ```

   The functions refuse to deploy or start without it, so tokens minted for
   other EVE apps are rejected.

6. Create the alerts encryption key. It is a secret holding 32 random bytes,
   base64-encoded:

   ```sh
   openssl rand -base64 32 | firebase functions:secrets:set ALERTS_TOKEN_KEY
   ```

   The functions also declare the `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
   secrets, so the deploy fails until both exist. If you are not running R2
   (see "What a fork does not get"), set placeholders:

   ```sh
   echo unused | firebase functions:secrets:set R2_ACCESS_KEY_ID
   echo unused | firebase functions:secrets:set R2_SECRET_ACCESS_KEY
   ```

7. Deploy:

   ```sh
   npm install -g firebase-tools && firebase login
   npm ci --prefix functions
   firebase deploy --only functions,firestore
   ```

   When asked to delete functions that the source no longer exports, answer
   yes. Cloud Functions are not deployed by CI, so rerun this whenever
   `functions/` or `firestore.rules` changes.

### 3. Host the site

Production is built and published by `.github/workflows/deploy.yml` on every
push to `main`.

1. In your fork, enable **Settings > Pages > Source: GitHub Actions**.
2. Add the build values as **repository variables** (Settings > Secrets and
   variables > Actions > Variables), using the same names as `.env`:
   `VITE_EVE_CLIENT_ID` and the `VITE_FIREBASE_*` variables. Optional:
   `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and the secret
   `SENTRY_AUTH_TOKEN` for source maps.
3. Custom domain: change `public/CNAME` to your domain (a user or org Pages
   site at `<user>.github.io` also works). Serve from the domain root: subpath hosting is untested, since
   `public/` and the landing page use absolute `/…` asset paths.
4. In the Firebase console, add your domain under Authentication > Settings >
   Authorized domains.
5. Optional: the `keep-old-assets.mjs` step in `deploy.yml` names
   `https://neocomdesk.com`. It never blocks a deploy, but point it at your
   site so tabs on an older build keep their chunks.
6. Push to `main`. The `deploy-dev` job (Cloudflare Pages) is the original
   author's preview channel for `develop`. It fails on every push to
   `develop` unless you delete it or add the secrets: it needs `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` secrets in a `dev` environment, and you can delete
   the job if you do not want a preview site.

CI (`.github/workflows/ci.yml`) needs no secrets. The scheduled workflows
(`public-data-*.yml`, `sde-refresh.yml`, `sde-verify.yml`, `cache-warm.yml`,
`keepalive.yml`) are the original maintainer's housekeeping. Leave them
disabled in the Actions tab; the `public-data-*` jobs need the R2 secrets and
`sde-refresh.yml` needs a `SDE_REFRESH_TOKEN` that opens PRs.

### 4. Branding to replace

These still carry the original identity and are worth changing for a public
fork:

- `USER_AGENT` in `src/esi/userAgent.ts` and its copy in
  `scripts/lib/constants.mjs`: ESI and EVE Workbench ask for a
  descriptive user agent that points at the real operator. Never use a
  personal email address.
- `REPO_URL` and `DISCORD_URL` in `src/lib/links.ts`, shown in the landing
  footer and Settings.
- Icons and screenshots in `public/` (`brand/`, `icons/`, `screenshots/`),
  the app name in `package.json`, and `public/privacy.html`, which
  names the operator and links the original repository.
- The Android wrapper (`twa/`, `public/.well-known/assetlinks.json`, package
  `com.neocomdesk.app`) is optional. Skip it unless you publish to the Play
  Store; see `docs/ANDROID-TWA.md`.

### What a fork does not get

The app reads a few shared public datasets (active wars, lawless systems,
public contract snapshots, market open prices) from
`https://data.neocomdesk.com`, a Cloudflare R2 bucket. That origin only allows
the original site and local development, so on your domain those fetches are
blocked and the app treats them as "no snapshot" and carries on: the
affected panels show less data, nothing breaks.

To produce them yourself, create an R2 bucket with a public custom domain and
GET-only CORS for your origin, then replace the origin in
`src/features/contractSearch/r2OfferSnapshot.ts`, `src/features/wars/activeWars.ts`,
`src/features/travel/lawlessSystems.ts` and `src/lib/swRoutes.ts`. Set
`R2_ENDPOINT` and `R2_BUCKET` in `functions/.env`, and the
secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` for the functions
(`firebase functions:secrets:set`) and as GitHub repository secrets alongside
`R2_ENDPOINT` and `R2_BUCKET`, which the scheduled `public-data-*.yml`
workflows use. Design notes are in `docs/adr/0019-contract-snapshots-served-from-r2-not-firestore.md`.
