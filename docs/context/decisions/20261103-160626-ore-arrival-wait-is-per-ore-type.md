# Scope decisions — Ore-arrival wait is per ore type

_Recorded 2026-11-03._

- **Settle up's "Ore still arriving" line only counts growth in the ore types of the entries being settled.** Refines `20261004-213852` "settle up waits for ore still arriving". The ledger has no moon or Payee, so a pilot who records ore for one Payee and then another in the same system the same day grows one shared (character, day, system) total; the first Payee's Settle up kept warning even though its own ore had stopped. Growth is now tracked per ore type, and a Payee whose ore types haven't grown within the 50-minute wait gets the small print instead.
- **Known limit.** Two Payees whose moons give the same ore type in the same system on the same day still share a warning; the ledger can't tell them apart.
- **The device-kept log changed shape.** An older `miningTaxOreArrivals` record fails its shape check and resets to empty, so the first fetches after upgrading show small print until growth is seen again.
