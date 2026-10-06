# Scope decisions — PI Map follows Plan preference; Plan filters not mirrored (issue #2708)

_Recorded 2026-10-05 · issue #2708._

- **Map follows Plan's Most ISK / Least hauling preference; it does not mirror Plan's type/tier/what-if filters.** Preference is a persisted setting (`usePlanPreference`), so both tabs read one value. Plan's filters are session-local state in "Find the best thing to build"; mirroring them needs shared persisted state, which is a new feature. Map has its own what-if line. The no-colonies note says the list is shown before the Plan tab's filters rather than claiming parity. Rules out: URL or persisted filter state for #2708.
