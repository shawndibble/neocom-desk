# Scope decisions — Server actions to reverse, edit and exempt; a Miner's copy of paid-through

_Recorded 2026-11-19._

- **Four new actions of the existing corp-book edit callable** (no new function, so no deploy-quota cost): `reverseAdjustment`, `editAdjustment` (a reversal plus a replacement that names it), `reverseWriteOff` and `setToleranceExemption`. `addAdjustment` takes an optional `kind: 'opening'`. All re-check the officer's role live and are audited.
- **A correction already billed on an issued Statement cannot be reversed or edited** (`billed-on-statement`): a Statement is frozen (D22), so the officer adds an opposite correction.
- **The Director-approval limit applies to the amount changed**: a reversal by its size, an edit by the difference. An exemption that forgives more than the book would is gated by the amount forgiven; one that charges a shortfall (0) only raises what is owed and is not gated.
- **Reversing a write-off undoes only the forgiveness.** A dispute it answered stays answered.
- **`minerPaid/{minerId}` is the Miner's own copy of their paid-through day**, written with the uids of the Miner's characters for each Miner an officer's client advances when it records accounts. `meta/paid` stays officer-only because it names every Miner. A Miner not advanced since this shipped has no copy until the next day closes for them. Grouping Miners drops the absorbed copies (they are a cache, rebuilt on the next advance); `toleranceExemptions` move with the Miner like corrections do. `toleranceExemptions` is readable by the Miner it is about, like corrections.
- **A change of nothing moves no money** (a new date or label on a correction), so the Director gate does not apply to it.
- **Additive for the shared Firebase project.** Old clients ignore the new fields and collections. The Firestore rules and the functions must be deployed before the app reads the new collections; the app only reads one after a write has stamped it, and treats a denied read as none, so an earlier app release is safe.
