# Scope decisions — Market Browser's no-range Distance option reads as a range

_Recorded 2026-11-27._

- **The no-range Distance option says it is a range, not a place.** Revises
  `20260929-204125`'s "Any distance reads as the header's scope". The option
  still names what the book falls back to, but as a range: "{hub} station
  only" in Trade Hub mode, "Anywhere in {region}" in Region mode, and "All
  regions" unchanged. A bare "Jita" under the header's "Jita" hub picker read
  as a second location picker (UX audit Nov 2026, S-102,
  `market__browser__1280.png`). The Distance filter keeps working in Trade Hub
  mode; hiding it was ruled out because the earlier decision made the range
  work there on purpose.
