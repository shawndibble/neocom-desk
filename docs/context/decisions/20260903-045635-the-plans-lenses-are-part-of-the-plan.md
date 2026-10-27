# Scope decisions (round 33) — the plan's lenses are part of the plan

_Recorded 2026-09-03._

- **What-If Implants and the Booster are stored on the Skill Plan and sync
  with it** (supersedes round 28's "the lens is not persisted … it therefore
  resets to Current on every mount"). Round 28 read the pair as presentation,
  next to Columns and Group-by. They are not: they decide what
  `computeSchedule` is handed, so the header's projected finish, the
  optimization badge and both optimizer results are all quoted under them —
  and a plan that reopened on a different lens quoted different numbers than
  the ones its owner left on screen, with nothing saying why. That is round
  28's own objection to remembering them, pointed the other way, and it is
  worse in the resetting direction: a figure the user chose, and can read off
  the pane, beats an unexplained slower one they did not.
- **Both are Editable Data, not device-local preferences.** Columns and
  Group-by stay device-local because they change what is _shown_; these
  change what is _computed_, which is the line the Editable Data entry
  already draws. They ride the existing `plans` collection as two additive,
  unindexed optional fields — no Dexie version bump, same as `markers`.
- **The Booster's expiry is stored as an instant, not as the control's
  wall-clock text.** The plan syncs, and `2026-09-10T14:30` names a different
  moment on a device in another timezone. The `datetime-local` control keeps
  editing local text and the conversion happens at the edge.
- **An empty expiry is committed on blur, never on change.** A native
  `datetime-local` reports an empty value for _any_ incomplete state — a
  cleared segment mid-retype included — so committing on change would erase a
  saved expiry, re-cost the plan and push the erasure to the user's other
  devices. Emptied-and-left means "no expiry"; emptied-and-still-editing
  means nothing yet, and the stored value stands until a complete one
  replaces it.
- **An absent stored Booster is what "the user has not answered" means**
  (refines round 32's "it seeds only while the control is untouched"). The
  accelerator prefill keys off the field's absence rather than off controls
  that happen to still read as default, which is what lets the legitimate
  answer — unticking the box, "that accelerator is gone" — survive a reload
  instead of being re-prefilled on the next one. Round 32 is otherwise
  unchanged: prefilled, editable, never frozen into the base sheet, expiry
  still blank on purpose.
- **Stored lenses are normalized on read and clamped on write.** They can
  arrive from an older build or another device, so an implausible value must
  never reach `computeSchedule` — the same reason round 28 put the +0..+5
  clamp in the resolver. Clamping the write as well is what keeps the stored
  plan saying what the plan is actually costed under, rather than a `+45` no
  screen ever showed.
- **Nothing changed for Build Plans**, which already synced every field a
  user enters, nested `materialSourcing` included. What both plan types
  gained is a pinned test: a fully-populated record whose key list is fixed,
  so a field added to either one fails the suite until its round trip is
  decided. The bug was never a wrong mapping — it was a field nobody
  remembered to map.
