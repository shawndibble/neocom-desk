# Scope decisions — Net worth drops the PLEX layer

_Recorded 2026-10-08._

- **PLEX is not a net worth layer.** ESI exposes no PLEX Vault (its asset `location_flag` list has no vault value), so the layer could only ever show hangar PLEX and would misstate a pilot who keeps PLEX in the vault. PLEX stays out of Assets too. Old rows keep a legacy `plexValue` that nothing reads or writes; a manual vault figure was offered as a later option.
