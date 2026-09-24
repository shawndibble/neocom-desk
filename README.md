# Neocom Desk

Installable, offline-capable PWA companion for EVE Online: multi-character
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
- **Market** — item price lookup at any region or all regions: SDE-backed
  search, jump-range and security filters, a quickbar of saved items,
  side-by-side compare, live order books, price history, price alerts, and
  an Appraisal of pasted items or EFT fits (net of fees, with LP store
  acquisition).
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
  calendar, contracts, and contacts, cached locally and viewable offline.
  Read-only except replying to/forwarding mail, marking mail read, and
  calendar RSVPs.
- **Corp tools** — role-gated ops board (structures, moon extractions),
  vitals, member roster, corp assets and wallet, for characters holding the
  relevant in-game roles.
- **Notifications** — in-app feed plus scheduled/foreground-polled alerts
  for skill training, industry jobs, planetary extraction, mail, market
  orders, contracts, wallet changes, and calendar events.
- **PWA** — installable to home screen/desktop, offline-capable, with an
  update prompt and a one-time install call-to-action.

## Architecture

- Static browser SPA (React 19 + TypeScript + Vite), hosted on GitHub Pages
  — no app server.
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

See `CONTEXT.md` (glossary), `docs/context/decisions/` (scope decisions),
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
`validate` job runs lint, format check, typecheck and build on every push, a
`test` job runs the unit suite across four shards, and an `e2e` job runs
Playwright across four more; that's the gate, not a local pre-PR run.

Copy `.env.example` to `.env` and set `VITE_EVE_CLIENT_ID` (EVE developer
application client ID, https://developers.eveonline.com).
