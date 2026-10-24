# Scope decisions — SRP doctrine-fit requirement (issue #4857)

_Recorded 2026-10-23 · issue #4857._

- **Doctrine Fits come from a Director's paste or pick.** A Director pastes EFT text or picks one of their own saved **Fitting**s. The corp keeps its own snapshot under `corps/{id}/srp`; later edits to the source Fitting never change it. A pilot's Fitting stays private.
- **The requirement is per Hull Rule.** A hull lists its **Doctrine Fit**s and only those hulls are checked. A hull with none is never checked. There is no corp-wide switch.
- **Match any one Doctrine Fit of the hull.** The claim records which one it matched.
- **What must match:** hull, modules, rigs and T3 subsystems, by exact type, order within a rack ignored. Charges, drones, cargo and implants are ignored. Rules out per-slot "also OK" substitute types (not in this ticket).
- **A mutated module counts as its base.** A killmail names only the abyssal type, so an abyssal module matches a Doctrine Fit module when that module is one of the abyssal type's possible bases. A rare false pass is accepted: a mutated module is usually worth more than the payout, and an officer reviews every claim.
- **A mismatch flags, never rejects.** The claim stays Pending, marked **Off doctrine**, with a diff against the nearest Doctrine Fit. The officer decides. Auto-reject may come later as a corp switch.
- **The pilot sees the result before filing** (match or Off doctrine with the diff) and can still file, adding the Fleet or FC note.
- **The result is a snapshot taken at filing.** Editing a Doctrine Fit later does not re-check filed claims.
- **Only a Director manages Doctrine Fits,** like Hull Rules and pricing.
- **Pricing is unchanged.** An Off doctrine claim is priced by the same chain; the officer may override.
