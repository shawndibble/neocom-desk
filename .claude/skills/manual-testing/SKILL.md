---
name: manual-testing
description: Set up a local browser sandbox with mock data so the user can try a feature by hand. Use when the user wants to "test the app locally", see mock/fake/seeded data (moons, miners, payments, statements), or poke a Firebase-backed page without a real EVE login.
---

# Manual testing sandbox

Gets the app running in a visible browser, signed in as a fake officer, against Firebase emulators seeded with mock data. Nothing touches real Firebase, ESI or SSO. The user's dev box is WSL2: Chromium opens through WSLg and `localhost` works as-is.

Work from a worktree, not the main checkout (see CLAUDE.md); `npm ci` plus `npm ci --prefix functions` there first, and copy `.env` from the main checkout.

## Fake identity (matches `e2e/support/fixtureData.ts`)

Officer/character `90000001` "Test Pilot", corp `98000001` "Test Corp", owner hash `OWNERHASH1`. The seed must use the same values, or the Firestore rules refuse the read.

## Steps

1. **Java.** The Firestore emulator is a JAR and the box has none. Download a portable JRE into the scratchpad, never system-wide:
   `curl -fsSL -o jre.tgz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse" && tar xzf jre.tgz`, then prefix `PATH` with its `bin/` for the emulator command.
2. **Emulators.** (needs `VITE_EVE_CLIENT_ID` from `.env`) `npm run emulators` in the background (`setsid nohup … &`); wait for "All emulators ready".
3. **Seed.** `node scripts/dev/seed-corp-tax-book.mjs --corp 98000001 --corp-name "Test Corp" --officer 90000001 --officer-name "Test Pilot" --owner-hash OWNERHASH1 --member 90000002 --guest 90000003 [--extra 12]`. It wipes the emulator first. Adds 6 refineries on 3 systems, extractions in every state, miners, statements, and paid / partial / over / unmatched / not-tax / manual payments. It prints the guest-facing verify URL at the end. To mock more (groups, feeders), extend that script in the schema of `functions/src/corpTaxBookStore.ts`.
4. **Browser.** `npx playwright test -c scripts/dev/playwright.sandbox.config.ts` in the background. It starts Vite on 5173 with `VITE_FIREBASE_EMULATORS=1`, opens a headed Chromium at `/corp/moons`, and stays open until the user closes the window. `scripts/dev/moons-sandbox.local.ts` fakes EVE SSO and ESI, answers `mintFirebaseToken` with an unsigned custom token the Auth emulator accepts, and answers `verifyCorpOfficerCallable` with a Director verdict (the real one reads live ESI). To land on another page, change the `signInAndGoto` path.
5. **Verify.** You cannot see the WSLg window. Prove it rendered with a headless copy of the config (viewport 1440x900, `page.screenshot`, wait ~40 s: the first Vite compile is slow), then Read the PNG.

## Expect

- A "Log in again / sync error" banner: the fake token cannot refresh. Harmless.
- Fake characters show as "Unknown 9000xxxx", moons as "Moon 4013900x": ESI cannot name made-up ids.
- `failed-precondition` console warnings from `characters/char:<id>` queries are known emulator noise (docs/agents/testing-and-ci.md).
- First page load is slow while Vite compiles.

## Pitfalls

- Never `pkill -f <pattern>`: it matches the Bash tool's own argv and kills the shell (exit 144). Stop things by PID.
- Do not kill other sessions' playwright/vite; port 5173 may be taken, so check before starting.
- Do not edit `.env.local`: the sandbox sets `VITE_FIREBASE_EMULATORS` through the config's `webServer.env`.
- Personal pages (Dexie / ESI-cache backed, e.g. Moon Mining Tax ledger) need no emulators: seed IndexedDB like `e2e/miningTaxNarrow.spec.ts` does instead.
- Any page that reads live ESI needs a route in `moons-sandbox.local.ts`, or it shows "Something went wrong". Corp wallet (`/corp/wallet`, reached from a payment's ledger link) is mocked: division balances plus 24 generic journal rows with refs 900001-900024. Only the ids match the seeded donations (payer and amount do not), so the link lands on a highlighted row; `--extra` above about 20 pushes refs past the journal and the highlight misses. Playwright globs: `*` stops at `/`, so use `wallets**` to cover `/wallets/1/journal`. A new page that errors is usually an unmocked ESI route: find it with `page.on('requestfailed')` / a headless screenshot.
