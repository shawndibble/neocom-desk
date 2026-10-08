# Scope decisions — Reactions in highsec warn, not block; unset reaction location is not highsec (issue #2908)

_Recorded 2026-10-08 · issue #2908._

- **A highsec Reaction Location only warns.** The hero reads "Can't run as planned", the list reads "Fix location" with figures dimmed; nothing is blocked and Log production stays enabled.
- **An unset Reaction Location is "Not set", never highsec.** The engine still prices it with the stored highsec default (reactor rig multipliers are x1 for highsec and lowsec, so the numbers are identical to lowsec); the warning is gated on a system actually being chosen. The stored band was left alone to avoid a data migration.
- **Compare is unchanged.** It has no verdict column, so there is no BUILD to replace.
- **Group rows are unchanged.** Group rollups do not carry a per-member location, so only plan rows read "Fix location".
