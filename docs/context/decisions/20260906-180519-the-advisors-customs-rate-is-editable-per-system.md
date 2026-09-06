# Scope decisions — The Advisor's customs rate is editable per system

_Recorded 2026-09-06._

- **The Advisor's customs rate is a default the pilot can override, per
  system.** This reverses decision 20260904-211654's "the customs rate is
  derived from the system, not asked for". That reasoning — the Advisor knows
  exactly which system it is showing, unlike the Plan tab, which answers for
  none — only holds in highsec, where the office is NPC and the formula is
  exact. Outside it the office is player-owned, its tax is in no ESI field, and
  `defaultCustomsRate` returns 0, so every margin on a lowsec, nullsec or
  wormhole colony was overstated by whatever the POCO owner charges with
  nothing on screen to say otherwise. The derived figure stays the field's
  default rather than being replaced: a highsec pilot must never have to type a
  number the app can work out exactly.

- **It is Editable Data, under one key holding a systemId-to-rate map.**
  `mergeSettings` is whole-value last-write-wins per key and
  `SYNCED_SETTING_KEYS` is an exact-match allow-list, so a key per system
  cannot be expressed without weakening that list into a prefix match — the
  same trade `syncedPreferences.ts` documents. Clearing one system's override
  empties an entry rather than deleting the key, so the tombstone-expiry edge
  in `merge.ts` does not apply. See `src/features/pi/customsOverride.ts`.
