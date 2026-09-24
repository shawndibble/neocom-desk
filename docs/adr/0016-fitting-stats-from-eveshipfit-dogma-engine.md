# 0016 — Fitting stats come from EVEShipFit's dogma engine and data

## Status

Accepted (2026-09-24)

## Context

The Fittings section (scope decision
`20260924-150509-fittings-section-a-fitter-after-all.md`) promises full ship
stats: capacitor, damage, resists and EHP, targeting, navigation and drones,
all under the active Character's skills and implants, with stacking penalties.
That means evaluating EVE's dogma rules: every module, charge, skill and
implant modifies attributes on the ship and on each other.

The SDE alone does not describe them completely. Many effects have no
`modifierInfo` and exist only in the game client's code, which is why Pyfa's
engine carries 1.38 MB of hand-written effect code. Our own SDE build keeps
no per-type dogma for ships, modules or charges today; it keeps only what
skills, PI and reprocessing need.

## Decision

Use `@eveshipfit/dogma-engine` (Rust compiled to WASM, MIT, ~409 KB) with its
matching patched data file from `@eveshipfit/sde` (`sde.dat`, ~9.7 MB), which
fills in the missing modifiers and derived attributes such as align time.

- Both load lazily, the first time a Fitting is opened, without blocking the
  page. A small progress indicator shows while they download. Both are
  runtime-cached so fitting works offline afterwards, and neither is
  precached with the app shell.
- Both versions are pinned together and bumped when a game patch changes
  dogma.
- The engine takes everything a Fitting carries: modules with offline, online, active and overload state, loaded charges, drones, fighters, cargo, **implants and boosters** (as slots, with booster side effects), mutated modules, a skills map, and a damage profile. Checked against the v13.0.1 typings.
- The engine is reached only through one seam module that takes a Fitting
  plus a skills/implants profile and returns stats. Nothing else imports it,
  so it could be swapped out.

## Considered options

- **Hand-write a dogma engine over our own SDE build.** Rejected. It means
  re-deriving the client-only effects and keeping up with every patch. That
  effort is the reason the competitors research advised against a fitter at
  all.
- **Show fitting resources only** (CPU, powergrid, calibration, slots). The
  maths is small, but it cannot answer "what does this fit do", which is the
  point of the feature.
- **libdgmpp (C++, MIT) compiled to WASM ourselves.** It is capable, but it
  would mean maintaining a toolchain and data pipeline of our own.
  EVEShipFit ships both, and is actively maintained (npm release 2026-09-23).

## Consequences

- The engine is MIT. The data file's EVE content falls under CCP's Developer
  License Agreement (the package ships it as `LICENSE.EVE`), which is the same
  agreement the app's own SDE snapshot and ESI use already depend on,
  including its non-commercial purpose. Only EVEShipFit's own additions
  are MIT.
- A first open on mobile data costs roughly 10 MB.
- Our stats inherit the engine's limits. It has no heat or burnout model,
  only the overload bonus. It can adapt the Reactive Armor Hardener to a
  chosen damage profile.
  Anything shown beyond what it computes is our own addition and is labelled.
- Items newer than the pinned data won't resolve until the next bump. A
  Fitting carrying one shows the item as unknown instead of failing.
