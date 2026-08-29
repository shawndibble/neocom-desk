# Sync backend setup (one-time)

The app itself stays on GitHub Pages. Firebase hosts only the sync backend:
Firestore (editable data: Skill Plans + `sync.`-prefixed settings) and one
Cloud Function (`mintFirebaseToken`) that exchanges a verified EVE access
token for a Firebase custom token (uid `char:{characterId}`, custom claim
`ownerHash`). EVE refresh tokens never reach Firebase (ADR 0001).

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
   `/characters/{uid}/plans|settings` for `request.auth.uid == uid`, with the
   ownerHash-claim check). The Rules Playground can simulate: a get of
   `/characters/char:1/plans/x` as uid `char:2` must be denied.
4. **Data flows**: create a Skill Plan on device A, sync, then sync on
   device B logged into the same character — the plan appears. Deleting a
   plan leaves a `deleted: true` tombstone doc that disappears after 30 days.

## Client model (for reference)

- One Firebase session per app instance; the client signs in **as the active
  character** and re-authenticates on character switch
  (`ensureSignedIn(characterId)` in `src/sync/syncAuth.ts`).
- Same character on another device → same uid → same docs (cross-device sync).
- If a character's ownerHash changes (character sold), the client wipes its
  local plans for that character before syncing, and Firestore rules stop the
  new owner from reading the previous owner's docs.
- UI must delete plans via `markPlanDeleted()` (records the tombstone) and
  write synced settings via `setSyncedSetting()`.

## Environment overrides (tests only)

`EVE_JWKS_URL`, `EVE_ISSUER`, `EVE_AUDIENCE` override the verification
defaults (`https://login.eveonline.com/oauth/jwks`, issuer
`https://login.eveonline.com` or `login.eveonline.com`, audience
`EVE Online`). Do not set these in production.
