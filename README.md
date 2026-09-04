# NeoCom Desk

Installable, offline-capable PWA companion for EVE Online: character overview,
skill planning with remap optimization, and industry planning.

Live: https://neocomdesk.com

## Features (v1 roadmap)

1. **Character views** — skills, wallet, transactions, assets, mail, calendar,
   contracts, own market orders. Read-only, cached locally, viewable offline.
2. **Skill Plans** — drag-and-drop plans with prerequisite auto-insert, in-game
   queue import, clipboard export, and remap/implant/booster-aware optimization.
3. **Industry** — build plans: blueprints, materials, job fees, taxes, and
   build-vs-buy against live trade hub prices.

## Architecture

- Pure browser SPA (React 19 + TypeScript + Vite), hosted on GitHub Pages.
- EVE SSO with PKCE straight from the browser. Refresh tokens never leave the device.
- Local-first: all API data cached in IndexedDB (Dexie); editable data (plans,
  settings) syncs through Firebase at free-tier scale.
- Market prices from Fuzzwork aggregates; static game data compiled to slim
  JSON from the SDE at build time (`npm run sde:build`).

See `CONTEXT.md` (glossary), `docs/DESIGN.md` (design system), `docs/adr/` (decisions).

## Development

```sh
npm install
npm run dev        # dev server
npm test           # vitest watch
npm run test:run   # tests once
npm run typecheck
npm run lint
npm run build
```

`npm install` also sets up a pre-commit hook (husky + lint-staged) that
auto-fixes lint/format on staged files and runs `typecheck` on every commit —
but that setup step is silently skipped if `ignore-scripts` is set in your
npm config (`npm config get ignore-scripts`). After a fresh clone or `npm
ci`, run `npm run verify-hooks -- --fix` once to install the hook and
confirm it's actually live; it fails loudly instead of pretending to work.
The full test suite and build run in CI, not locally.

Copy `.env.example` to `.env` and set `VITE_EVE_CLIENT_ID` (EVE developer
application client ID, https://developers.eveonline.com).
