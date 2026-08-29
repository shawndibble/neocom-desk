# NeoCom Desk — Ubiquitous Language

## Glossary

- **Character**: One EVE Online character. The unit of login (EVE SSO) and of API data. App supports many Characters side by side from day one.
- **Account**: Implicit app-level grouping of linked Characters, used only to sync editable data across devices. Never surfaced to the user as a thing to manage.
- **Editable Data**: Data created inside the app (Skill Plans, Build Plans, settings). Synced across devices. Everything else is API-derived and re-pulled per device.
- **API-Derived Data**: Character data pulled from ESI (assets, mail, wallet, etc.). Cached locally per device for offline viewing. Never synced through the backend.
- **Skill Plan**: An ordered list of skill-level entries a user intends to train. User-editable (drag and drop). Distinct from the in-game **Skill Queue**, which is the game's actual training queue.
- **Remap**: In-game reallocation of a character's attributes. The optimizer suggests where in a Skill Plan remaps should be placed.
- **Build Plan**: An industry plan for manufacturing: blueprints needed, materials, costs, fees/taxes, time, and build-vs-buy comparison. v1 scope: manufacturing only (no invention/reactions).
- **Trade Hub**: A market station/region the user picks for price lookups in a Build Plan.

## Scope decisions (v1)

- Multi-character from day one.
- Corp/alliance: public info + the member's own view only. No director tooling.
- Read-only: no ESI write scopes (no mail send, no calendar respond).
- Industry: manufacturing only; model shaped so invention bolts on later.

## Glossary (round 2 additions)

- **Optimize Modes**: Skill Plan optimizer actions — "optimize now" (optimizer chooses remap placement, keeps order), "optimize at remap points" (user drags **Remap Markers** into the plan; optimizer computes the best attribute spread for each marker-delimited segment), "suggest full reorder" (attribute-grouped reorder honoring prerequisites; user accepts or rejects). Reorder never applies silently.
- **Remap Marker**: A user-placed row in a Skill Plan marking where the character will remap attributes. Draggable like a plan entry.
- **What-If Implants**: Optimizer override that assumes a hypothetical implant set (+3/+4/+5) instead of the clone's current implants.
- **Booster**: Cerebral accelerator; user toggles it on manually with an expiry date for training-time math.

## Scope decisions (round 2)

- Sync backend: Firebase (Firestore + one Cloud Function for EVE-token → custom-token exchange). Free scale.
- EVE refresh tokens never leave the device; per-device SSO login.
- Trade hubs v1: Jita 4-4 (default), Amarr, Dodixie, Rens, Hek.
- i18n wired from day one (i18next), English-only catalog until stable.
- Hosting: https://shawndibble.github.io/neocom-desk (project page).
- Design system: docs/DESIGN.md + hidden /styleguide route; Photon-UI-inspired dark theme.

## Glossary (round 3 additions)

- **Market Browser**: General item price lookup page (any item, prices at chosen Trade Hub). Separate from a character's own **Market Orders** (open + history).
- **Facility Preset**: Industry location model: NPC station or player structure type (Raitaru/Azbel/Sotiyo) + rig level. Drives ME/time/cost bonuses in a Build Plan.
- **Data Age**: Timestamp shown on every API-derived view; how old the cached data is. Refresh happens on app open + manual button only.

## Scope decisions (round 3)

- Milestones: Foundation → Skills viewer + Skill Plans → Industry → remaining character views (mail, calendar, contracts, wallet, orders, assets).
- Skill Plans: multiple named plans per character; import from in-game queue; export to game clipboard format.
- Industry: facility presets + live system cost index (ESI) + character-skill-derived taxes/fees + owned-blueprint awareness.
- Repo: public, MIT + CCP third-party developer notice.
