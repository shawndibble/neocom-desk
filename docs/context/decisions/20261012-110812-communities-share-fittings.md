# Scope decisions — Communities share fittings (issue #3605)

_Recorded 2026-10-12 · issue #3605._

- **Sharing a Fitting is another way to export it, and opening one is another
  way to Load it.** A shared Fitting opens like any **Load**ed Fitting: stated
  for the opening Character's skills, editable, savable to their own My
  Fittings and to their EVE account. The sharer's skills are never shown or
  stored. Nothing is stored for the opener until they explicitly save.
- **What is stored:** per shared Fitting, the owning Character, the Fitting's
  id, name, hull, its full permanent **Fitting Share Code** URL, and an
  updated-at time. Notes stay private and are never shared. The code is stored
  whole so a Member can open it with no decoding step of their own.
- **A shared saved Fitting follows its owner's saves.** A saved Fitting's id
  is stable (`FittingRecord.id`), so a re-save re-pushes the new code and
  updated-at to every Community it is shared to. No "update shared copy"
  button. Deleting the saved Fitting removes its shared copies in the same
  step.
- **An In-game Fitting is shared as a snapshot.** The app never stores an
  In-game Fitting and cannot see it change, so sharing one writes a copy of its
  code as of that moment, keyed by its ESI fitting id. It carries only what an
  In-game Fitting carries (no module state, charge binding or implants).
  Sharing it again replaces the copy. Its updated-at is the time of the last
  share, shown as "last updated" like any other.
- **Opt-in per Community; nothing shared by default.** Two ways in:
  - **"Share all my Fittings" is an ongoing switch**, per Community, on the
    Community page. While on, every saved Fitting of that Character is shared
    to that Community, and every later save or new Fitting is pushed
    automatically; deleting one removes it from the shared list. While it is
    on, the per-Fitting share control for that Community reads "shared with
    all". Turning it off removes every Fitting that Character shared to that
    Community, including any shared one by one, so none stay available. The
    switch asks first, since it removes them all. Leaving the Community does
    the same, as for blueprints.
  - **Per Fitting**, from its Export or Fitting-actions menu, "Share to
    Community". A Character in several Communities gets a submenu listing
    them; in one, the item shares straight to it; in none, the item is
    absent. Unsharing is available from the same menu.
- **Shared Fittings live in the Member's own Fittings list.** No separate
  tab. They appear in the Ships section's Fittings library, searched and
  grouped by hull like any other row, marked with a Community icon. The
  tooltip names who shared it and when it was last updated. Opening one is
  exactly a **Load**: it becomes the opener's own working Fitting, which they
  can edit, save to My Fittings (a copy that stops following the original)
  and save to EVE. Rename and Delete of the shared row itself do not apply to
  a Fitting someone else owns.
- **No cap on shared Fittings for now.** Revisit if writes or reads grow.
- **Same gate and lifetime as shared blueprints (ADR 0018).** Readable only
  by Members; written only by the owning Character under the `ownerHash`
  guard; leaving or removal deletes that Member's shared Fittings at once; a
  logged-out Character is offered the same removal; `purgeStaleAccounts`
  covers the collection.
