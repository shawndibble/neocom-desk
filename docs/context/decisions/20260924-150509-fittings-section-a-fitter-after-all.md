# Scope decisions — Fittings section: a fitter after all

_Recorded 2026-09-24._

- **Neocom Desk gets a ship fitter.** This reverses the recommendation in
  `docs/research/competitors.md` (a Pyfa-depth simulator "explicitly not
  recommended") and `docs/UX-REVIEW.md` §7 ("don't build a fitter"). Neither
  was a recorded scope decision; this is. The cost that research feared, a
  hand-written dogma engine, is avoided by adopting an existing one — see
  ADR 0016.
- **Full stats, not just fitting resources.** Capacitor, offense (per weapon,
  plus overheated values where modules overheat), defense with per-layer
  resists, targeting, navigation, drones, fitting and price, laid out in the
  game fitting window's own collapsible sections. Applied DPS is graphed
  against range and against target speed, under a chosen damage profile
  (four pure types plus the common NPC factions) and target profile. Custom
  profiles are user-authored and sync with settings. Fleet boosts and command
  bursts are out of v1. The Reactive Armor Hardener is shown at its starting
  split; adapted resists are not simulated.
- **A Fitting's numbers follow the active Character.** Switching Character
  re-states the open Fitting live, with over-budget CPU/powergrid flashing.
  Implants and combat boosters come from the Character's clone or from the
  set the Fitting carries, by a toggle beside the Character name. A Fitting
  that carries a set opens on it. The set is edited from a picker in the
  Fitting's header.
- **Missing skills are one step from a Skill Plan.** A chip states the count
  and training time at current attributes, and adds the skills to an existing
  or new Skill Plan.
- **The URL is the working state; storage is opt-in.** An open Fitting lives
  in `?f=<share code>` and every edit rewrites it, so the address bar is
  always a share link. Nothing is written to Dexie or Firestore until an
  explicit save to My Fittings, whose record is `{id, name, code,
updatedAt}` — the same code the URL carries. In-game Fittings are read
  through the ESI cache and never copied.
- **Share codes use the platform's `CompressionStream`, no library.** A
  versioned compact type-ID encoding (module state, charges, drones, cargo,
  implants), deflated and base64url'd — about 150–300 characters. This keeps
  the Appraisal share decision's rule against compression libraries
  (`20260911-110045`). Abyssal module rolls are not encoded in v1.
- **Share links open without login, at All V.** The only place skill level V
  is assumed, stated in a banner. Everywhere inside the app there is always
  an active Character.
- **Fittings read and write scopes join the Base Grant.** New logins get
  them. A Character whose stored grant predates them sees an "Allow fittings
  access" prompt on the Fittings page, which re-logs just that Character.
  `esi-fittings.write_fittings.v1` becomes the third write exception to the
  read-only-by-design scope list, after mail organizing and calendar RSVP.
  ESI has no edit, so saving over an In-game Fitting deletes and recreates
  it, and ESI drops module state, charge-to-module binding and implants —
  the export says so.
- **Corporation fittings arrive only as a Loaded file.** ESI has no corp
  fittings endpoint (esi-issues #234). The in-game export's multi-fit XML is
  Loaded as a temporary list; nothing is stored unless a Fitting is saved.
  No corp library — "no director tooling" (`20260829-094708`) stands.
- **Load and export formats.** Load: EFT, DNA and in-game chat links, EVE
  XML, In-game Fittings, share links, eveship.fit links, zKillboard killmail
  links. Export: share link, EFT (the route to EVE Workbench, whose API
  cannot create fits and needs a key a browser app cannot keep secret),
  in-game chat link, save to EVE, save to My Fittings, multibuy. Priced
  through the Appraisal engine.
- **Compare is two things.** Per-module variations show the whole-Fitting
  change of swapping each variant in — only the stats that change — with
  fits, can-fly and price. Fitting vs Fitting puts up to three side by side
  (`?f=…&f=…`), phone showing two at a time.
- **Ring or List, per device.** The editor offers the game's slot ring (ship
  render in the centre, CPU/PG gauges on the ring) and a slot list. Desktop
  defaults to Ring, phone to List; the choice is a device-local setting, not
  URL state (`20260922-221531`). The desktop Add panel is a market-group item
  browser filtered to what fits the slot and hull.
- **Fittings is a top-level section** and one of the choosable phone
  bottom-bar tabs.
- **Damage-type colours become `dmg-*` tokens.** The game's EM / Thermal /
  Kinetic / Explosive colours, as a documented exception to DESIGN.md's
  single nominal palette — see DESIGN.md §1 "Damage types".
