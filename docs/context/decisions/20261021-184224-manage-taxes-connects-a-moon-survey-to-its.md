# Scope decisions — Manage Taxes connects a moon survey to its payee (issue #4684)

_Recorded 2026-10-21 · issue #4684._

- **One click, no setup (owner decision).** Manage Taxes on a moon Survey (the owner's row and everyone else's read-only line) no longer opens the Tax tab or asks before adding a Payee. It finds the pilot's Payee by name (any case), or adds it at the Survey's rate with Undo. It then stores a **Survey connection** and assigns the matching ore already in the Mining Ledger. The owner's click still makes the rate an existing Payee's default; a viewer's keeps their own. The button becomes "Assigning to <name> until <ETA>" with a Mining Tax link and Stop, and focus moves between the two. This supersedes `20261009-112001`'s "It does not open the Assign dialog: an Assignment must claim ore the Mining Ledger already holds": ore still has to be in the ledger to be assigned, but the connection waits for it.
- **A connection is a standing rule until the Survey's ETA.** It holds:
  - the Survey's Payee and rate;
  - the system of the Survey Location (via `resolvePlaceSystemId`; null until there is one that resolves);
  - the moon ore types in its scans;
  - the window, from the first scan's UTC date until `summary.etaAt`. Once the field is found empty, the window ends then. With no ETA yet it runs to the link's expiry, and never past it.

  A moving ETA, a location set later or a new moon ore is saved onto it while the Survey is open. It stays live an hour past its end, for the ledger's lag. Per Character: the active one who clicked, since Payees are per Character. A connection that no longer names the Survey's current Payee and rate (the owner changed them) shows Manage Taxes again.

- **It runs whenever the ledger is read.** The Tax tab's load (`snapshot.ts`) applies every live connection before reconcile. An open, connected Survey re-reads the ledger every five minutes (ESI caches it for ten). A run that assigns something says so with Undo.
- **Never guess between moons.** The ledger knows a day, a system and an ore type, never a moon, so a connection is told apart by its ore types and by time.
  - An entry holding unassigned ore that no live connection's types cover (another moon's ore) is left alone for the pilot.
  - So is ore two live connections both claim. When only one of them is still before its ETA (the other in its grace hour), that one wins.
  - Already-assigned ore is never touched, and neither is an entry whose growth collector is a dismissal.
  - A connection whose Payee and rate already collect the entry's growth, unpaid, is left to that Assignment, which absorbs the ore through reconcile.
- **A connection's Assignment takes the entry's growth (`AssignInput.takesGrowth`).** A sole unpaid Assignment otherwise collects every later ore line on its day and system (`ownership.ts`), including the next moon's. Making the newest connection's Assignment the collector, and moving the flag off the earlier one, sends ore mined after the switch to the moon being mined. Ore mined after an ETA with no other connection live still grows into that day's existing Assignment, as any Assignment's growth does; Stop doesn't change that. Fix it with the existing edit or split.
- **Stored as one synced setting, not a collection** (`sync.miningTaxSurveyConnections`). A handful of short-lived records, pruned on every write. Settings need no Firestore rules change, and a second device keeps assigning the same moon. Whole-value last-write-wins: two devices connecting different Surveys in the same moment can lose one, which the next click restores.
- **The Survey's Undo toast covers what that run did.** It covers the Assignments made, the connection, and a Payee the click added. Assignments the Tax tab's load makes show up as ordinary rows there, with no toast.
