# Scope decisions — Three more Settings defaults: courier collateral multiple, BPC Sourcing hide toggles, Hauling start hub

_Recorded 2026-09-26._

- **Courier collateral warning multiple is a synced Settings > Market preset (20×, 50×, 100×, 200×), default 50×.** It is a pilot's risk appetite, so it travels with them. Presets keep the modal's copy legible.
- **BPC Sourcing's "hide auctions" and "hide PLEX contracts" get synced start-state defaults, off by default.** They only set where the toggles start; the URL still wins (ADR 0015), so a view can switch one back without touching Settings.
- **Hauling Opportunities starts From the default Trade Hub, To Jita (Amarr when From is Jita).** No new key — it reads `sync.marketHub`. A Jita pilot sees the same lane as before.
- **Mining Tax's auto-absorb of unpaid growth stays fixed behaviour.** It rewrites ledger rows rather than choosing a view, so a toggle needs its own design; not part of this change.
