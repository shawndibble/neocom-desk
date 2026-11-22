# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

EVE Online players, from solo pilots to corp officers, anywhere in New Eden (not just Jita and the trade hubs). Many run several characters.

- **Desktop, beside the EVE client.** The main surface. Players copy and paste between the app and the game, so desktop comes first.
- **Phone.** Mainly alerts and notifications, including mail. Also route and pilot lookups, plus a lot of skill planning and ship fitting.

## Product Purpose

Neocom Desk is an installable PWA companion for EVE Online. It replaces a pile of single-purpose tools with one app that knows your characters, and it guides decisions with that data. Success is a player who plans skills, fits ships, finds items, tracks mining and PI, and gets alerted without leaving for another tool.

## Positioning

**Undecided.** The EVE tool field is crowded. Some tools are installable PWAs, some run locally, and some go deeper in a single niche. No single claim is exclusive. What Neocom Desk does is combine many tools, with your settings applied across them:

- A large alert system.
- Skill training and planning driven by ship fits, including which skills would improve a fit.
- Easy module alternatives for a fit.
- Market search by jump distance, across regions.
- Mining and moon-tax tracking, with a field depletion tracker.
- Travel and routing. It remembers your settings and avoided systems and applies them elsewhere, such as market jumps and assets.

Do not write copy that claims uniqueness. The breadth, and settings that carry across features, are the honest argument.

## Operating Context

- Static SPA hosted on Cloudflare Pages. No app server. EVE data comes from CCP's ESI and is cached per device in Dexie. Editable data (Skill Plans, Build Plans, synced settings) syncs through Firebase.
- Refresh tokens live in Dexie only, apart from the narrow opt-in grants named in `CLAUDE.md`.
- Sign-in is EVE SSO (PKCE), with many characters side by side.
- `develop` ships to dev.neocomdesk.com and `main` is production at neocomdesk.com. Both share one Firebase project.
- Played far from the hubs: users span nullsec and wormholes, so never assume Jita or frequent trips.

## Capabilities and Constraints

- **Features** (see `README.md`): characters, skills and Skill Plans, industry Build Plans, BPC sourcing, ship fitting, market, open orders, mining, planetary industry, character data views, corp tools, notifications.
- **Terminology:** `GLOSSARY.md` is authoritative. Use its terms exactly.
- **Language:** English only for now. All UI strings go through i18next.
- **Offline:** character data and Skill Plans work offline. Market and first-time large data files need a connection.
- **Hidden rules:** public repo, so a "secret" rule may live in tickets or code but never in UI, mail or help text. "Feeder" and "Collector" are dev-only terms. Player-facing wording is chosen per feature.
- **Usable without login:** the fitter works logged out.

## Brand Commitments

None beyond `docs/DESIGN.md`: dark-only, inspired by EVE's Photon UI, dense over spacious.

## Evidence on Hand

- `README.md` feature list and `docs/ARCHITECTURE.md`.
- `docs/DESIGN.md`, `docs/adr/`, and scope decisions in `docs/context/decisions/`.
- Competitor survey logs under `docs/` (written by `/add-missing-features`).
- No testimonials, user counts or benchmarks exist in the repo. Do not invent any.

## Product Principles

1. **One app, shared context.** Settings such as routing avoids, home region and characters apply everywhere. A user sets them once.
2. **Guide the decision, not just show data.** Tell the player what to train, change or buy, and why, using their own characters and fits.
3. **Desktop-first, phone for glances.** Design the desktop flow next to the game client. On phone, put alerts and quick lookups first.
4. **Players are everywhere in New Eden.** Distance, region and security choices matter. Never default to Jita.
5. **Familiar before novel.** Follow EVE client and common tool conventions so users don't relearn.

## Accessibility & Inclusion

No product-specific standard has been set beyond `docs/DESIGN.md`. Touch is part of every interaction rule.
