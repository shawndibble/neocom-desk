# Scope decisions (round 28) — per-attribute What-If Implants

_Recorded 2026-09-02._

- **A What-If Implant set is five independent bonuses, not one number.** The
  control only offered a uniform +1..+5 in every slot, which no real clone
  wears: hardwirings are fitted per attribute, so +4 PER / +5 INT / +3 MEM /
  nothing else is the ordinary case and was inexpressible. The presets stay
  exactly as they were — **None**, **Current** and the five matched sets are
  each still one click — and per-attribute editing is layered on top of them
  rather than replacing them, so the common case never costs five
  interactions.
- **A preset populates the five values; editing one value makes the selection
  Custom.** Picking a preset fills all five; editing a slot seeds a custom set
  from whatever the preset currently resolves to, changes that one slot and
  leaves the other four alone, and the picker flips to a **Custom** entry that
  exists only while it is in force — Custom is a readout of the values, never
  something to choose. The five inputs are always visible (one row of five
  under the picker, not a disclosure), because the whole point of the lens is
  that what the plan is being costed against is legible.
- **"Current" stays a distinct preset rather than becoming initial values.**
  It resolves late, against whatever the character is wearing when the
  schedule is computed, so it is always the clone's real fitted set and never
  a snapshot that goes stale when ESI re-reads the implants. That is also what
  makes it the one-click way back after experimenting, which is required: a
  hypothesis the user cannot undo is a trap.
- **The lens is not persisted, unlike the Columns and Group-by preferences
  beside it in the same pane** (superseded by round 33 — it is stored on the
  plan and syncs with it). Those are presentation-only; this one changes
  the numbers — the header's projected finish, the optimization badge and both
  optimizer results are all computed against it. Below `lg` the tools pane is
  a _collapsed_ disclosure, so a remembered "+5 everywhere" would silently
  inflate every figure on the page with nothing on screen saying why. It
  therefore resets to **Current** — the truth — on every mount.
- **The +0..+5 clamp lives in the resolver, not only on the input.** Bonuses
  are rounded and clamped as they are read, so a cleared field, a pasted word
  or an implausible stored value can never reach `computeSchedule`, which
  would otherwise add it to an attribute and report a NaN finish date. The
  resolver returns all five slots (`0` for an empty one) rather than a sparse
  map: every consumer already reads `implants[name] ?? 0`, and one shape means
  the control never has to ask whether a slot is absent or zero.
- **The what-if control and a display of the character's current attributes
  stay two things.** They share five attribute names but not a unit — the
  control edits _implant bonuses_ (0..5), an attributes display reads
  _effective attribute points_ (`20 + 4 = 24`, which `AttributeChips` already
  folds the bonus into). Merging them would either make the character's real
  sheet look editable or make the hypothesis look like fact, and round 26
  already rules that a display of the sheet never falls back to defaults while
  the planner's lens must always be operable.
