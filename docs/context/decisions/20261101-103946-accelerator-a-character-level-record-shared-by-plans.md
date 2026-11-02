# Scope decisions — Accelerator: a character-level record shared by plans and the Characters table

_Recorded 2026-11-01._

- **No ESI endpoint says an accelerator is running, so the pilot's own answer is the only source of an expiry.** It becomes a per-Character record, `characterAccelerators` (bonus + expiry instant, id = Character id), in Dexie and synced as Editable Data (additive, so dev and prod can share the Firebase project). `firestore.rules` and `firestore.indexes.json` gained the collection; they are deployed by hand.
- **A typed-in accelerator wins while it has not run out.** Once it has, it is deleted (with a tombstone, so the deletion syncs) the next time any editor or the Characters page loads, and detection from the attribute sheet (a **Detected Accelerator**) applies again. Detection never writes the record: it is a guess with no expiry.
- **The Characters table's Accelerator column and the Skill Plan's Booster list edit the same record** through one shared component (`AcceleratorFields`), so the two cannot show different times. The column says "Yes" with the bonus and a countdown for a typed-in expiry, "Yes" with the bonus alone for a guess, and "No" otherwise; a pencil is always there. It is off by default and sits after Training. No sort, CSV or card line for it.
- **In a plan, the Character's running accelerator is the first Booster row**; the plan keeps only the rows it queues behind it (rows with a start). A row a plan stored itself with no start is superseded while the Character's is running. With none running, plans cost exactly as before, so old plans are not rewritten. A first row with no expiry stays on the plan so a bonus typed before its expiry is not lost.
- **The Calendar gets an "Accelerator expires" clock** at the typed-in expiry, for the active Character. It reads Dexie only, so it has no ESI permission to lack.
- **The alert (`acceleratorExpiring`) is its own decision file**, written with the event.
