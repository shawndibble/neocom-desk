# Scope decisions — Ore a book took stays released

_Recorded 2026-11-22._

- **"Let the corporation bill it" is remembered on the Assignment.** The game's ledger keeps
  reporting ore a Corp Tax Book took off a pilot's entry, so with a sole Assignment as the growth
  collector that ore grew straight back in and clashed with the book again. The Assignment now
  stores `releasedTypeIds` (additive, optional); `computeOwnership` neither grows nor offers those
  types for that entry. A Survey connection's takeover does not set it, since its ore is assigned
  elsewhere. Rules out hiding the ore by editing the ledger entry, and a new synced setting.
  Existing entries need "Let the corporation bill it" once more.
