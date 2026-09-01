# Sync backend setup (one-time)

The app itself stays on GitHub Pages. Firebase hosts only the sync backend:
Firestore (editable data: Skill Plans, Build Plans + `sync.`-prefixed
settings) and one Cloud Function (`mintFirebaseToken`) that exchanges a
verified EVE access token for a Firebase custom token (uid
`char:{characterId}`, custom claim `ownerHash`). EVE refresh tokens never
reach Firebase (ADR 0001).

## Prerequisites

- Firebase project `neocom-desk` (already referenced by `.firebaserc` and
  `.env` `VITE_FIREBASE_*`).
- **Blaze (pay-as-you-go) plan** — required to deploy Cloud Functions v2.
  Hobby-scale usage stays inside the free quotas, but the plan must be Blaze.
- Firebase Authentication initialized once (Build → Authentication → Get
  started). No sign-in provider needs enabling: custom-token sign-in works
  out of the box.
- Firestore database created (Build → Firestore → Create database,
  production mode; rules are deployed below).
- Node 24 locally (functions runtime is `nodejs24`).

## Function configuration (required)

The function only accepts EVE access tokens minted for **this** application.
Every EVE token carries the generic `"EVE Online"` audience, so without this
check a token from _any_ third-party EVE app would be accepted.

Set `EVE_CLIENT_ID` to the app's EVE application client ID(s). It's
comma-separated: dev (`localhost` callback) and prod (GitHub Pages callback)
are separate EVE application registrations, but both point at this one
deployed function, so it must accept either. Cloud Functions v2 loads it from
a dotenv file in `functions/`:

```sh
# functions/.env  (picked up by firebase deploy and the emulator)
EVE_CLIENT_ID=<dev client_id>,<prod client_id>
```

The dev value matches `VITE_EVE_CLIENT_ID` in the root `.env`; the prod value
matches the `VITE_EVE_CLIENT_ID` GitHub Actions repo variable that the deploy
workflow builds with.

The function **fails closed**: it throws at cold start (and deployment fails)
when `EVE_CLIENT_ID` is missing, instead of silently accepting any EVE app's
tokens. The callable is also capped at `maxInstances: 5` — hobby-scale abuse
ceiling.

Optional hardening (not enabled): Firebase **App Check** can additionally
require that callable requests come from the deployed web app. It needs
console setup (reCAPTCHA/attestation provider + client SDK wiring) before
enforcement, otherwise it locks everyone out — leave it off until that is
done deliberately.

## Commands

```sh
npm install -g firebase-tools   # or use npx firebase-tools
firebase login
cd <repo root>

# install + verify the function locally first
npm --prefix functions install
npm --prefix functions test
npm --prefix functions run typecheck

# deploy the callable function + Firestore rules/indexes
firebase deploy --only functions,firestore
```

`firebase deploy --only functions` runs the predeploy TypeScript build
automatically. To deploy rules alone: `firebase deploy --only firestore:rules`.

## What to verify afterwards

1. **Function exists**: Firebase console → Functions shows `mintFirebaseToken`
   (v2 callable, us-central1, runtime nodejs24).
2. **Token exchange works**: from the running app (signed into a character),
   trigger a sync; Authentication → Users should show a uid like
   `char:94832766`.
3. **Rules are live**: Firestore → Rules shows the deployed
   `firestore.rules` (reads/writes only under
   `/characters/{uid}/plans|buildPlans|settings` for
   `request.auth.uid == uid`; single-doc `get`/`update` additionally require
   the doc's `ownerHash` to match the token claim, while `list` is uid-only —
   the client always queries `where('ownerHash', '==', <hash>)`). The Rules
   Playground can simulate: a get of `/characters/char:1/plans/x` as uid
   `char:2` must be denied.
4. **Data flows**: create a Skill Plan on device A, sync, then sync on
   device B logged into the same character — the plan appears. Deleting a
   plan leaves a `deleted: true` tombstone doc that disappears after 30 days.
   Build Plans behave identically under `/characters/{uid}/buildPlans`.

## Client model (for reference)

- One Firebase session per app instance; the client signs in **as the active
  character** and re-authenticates on character switch
  (`ensureSignedIn(characterId)` in `src/sync/syncAuth.ts`).
- Same character on another device → same uid → same docs (cross-device sync).
- If a character's ownerHash changes (character sold), the client wipes its
  local plans for that character before syncing, and Firestore rules stop the
  new owner from reading the previous owner's docs.
- UI must delete Skill Plans via `markPlanDeleted()` and Build Plans via
  `markBuildPlanDeleted()` (both record the tombstone that propagates the
  delete), and write synced settings via `setSyncedSetting()`.

## Environment overrides (tests only)

`EVE_JWKS_URL`, `EVE_ISSUER`, `EVE_AUDIENCE` override the verification
defaults (`https://login.eveonline.com/oauth/jwks`, issuer
`https://login.eveonline.com` or `login.eveonline.com`, audience
`EVE Online`). Do not set these in production. `EVE_CLIENT_ID` is different:
it is **required** in every environment (see "Function configuration").
