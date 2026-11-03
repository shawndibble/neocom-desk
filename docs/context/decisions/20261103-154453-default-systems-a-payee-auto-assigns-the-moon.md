# Scope decisions — Default Systems: a Payee auto-assigns the moon ore of its systems

_Recorded 2026-11-03._

- **A Payee carries a list of Default Systems and assigns for them.** It replaces
  the single legacy `systemId` ("remember this system"), which is removed with
  a one-time migration of any stored value into the list. Edited only in the
  Manage Payees modal, as a Default Systems section with add/remove for many
  systems. No other surface names or sets it (no Assign-dialog checkbox).
- **Assigned automatically, not just suggested.** Moon ore (the only ore the
  ledger groups into entries) mined in a Default System is assigned to the
  Payee at its default tax % and Trade Hub, valued on the mined date, the same
  way a Survey connection prices it. Forward-only: from the day the system was
  added, so older Unassigned ore is never billed unasked.
- **One Default Payee per system per Character.** Setting a system a second
  Payee already holds is blocked with a notice naming that Payee: remove it
  there first. Payees belong to one Character, so two alts may each default
  the same system.
- **Last in the order.** After a Survey connection, history and everything
  else. The Assign dialog's pre-selection keeps "last used here" first and adds
  the Default Payee as its final step before nothing is pre-selected. Auto-assign
  uses only Default Systems and Surveys, never history.
- **A hidden `override` flag on every Assignment decides who may replace it.**
  Set when the pilot assigns, edits, splits, changes or unassigns, and when a
  Survey connection assigns; unset on a default's Assignment. Additive and
  backward-compatible (absent on stored rows means set), because dev and prod
  share one Firestore. Nothing in the UI shows it: a default's Assignment looks
  and works like any other (no badge).
- **An Assignment without `override` behaves as unassigned to the Survey.** The
  Survey takes only its own ore types (splitting the Assignment if it holds
  more), on every day of its window, exactly as for unassigned ore. Paid or
  part-paid ore is never taken. Run order on a load: Survey first, then default.
- **Unassign, change, split and removal stick.** The default only acts on an
  entry no Assignment covers at all, so a change, a split or a dismissal keeps
  it out. A deleted Assignment leaves no trace, so `unassign` also records the
  entry (`characterId|date|systemId`) in the synced setting
  `sync.miningTaxDefaultOptOuts`, pruned to 120 days, and the default skips
  those. Growth and new ore types on an entry the default made are absorbed by
  the normal reconcile (a sole Assignment collects everything), so the default
  never tops an entry up.
- **The Corp Tax Book reads a non-override Assignment as given to no Payee.**
  The book claims that ore as it does Unassigned ore. A conflict or dispute
  arises only if the miner paid against the Assignment or `override` is set
  (manual change or Survey). The claimed Assignment is kept, ignored on the
  read side (row relabelled Unattributed or Pending, Payee balance drops
  the ore) and comes back if the corp lets the day go. A miner's records never
  change the book. Revisit if an officer or miner wants this different. It reuses
  the path a corporation's own Payee takes (`takeOwnAllocations`), so it is
  whole-or-nothing: a default Assignment listing more ore than the book
  observed that day (the miner also mined elsewhere in the system) stays the
  miner's, and the existing conflict flow applies.
- **Shared systems are not handled.** The ledger knows systems, not moons, so
  everything in a Default System goes to its Payee until the pilot overrides
  it. A pilot who shares a system leaves it out of Default Systems.
- **Removing a system, or deleting the Payee, leaves existing Assignments
  alone** (invoice semantics); it only stops future ore being defaulted.
