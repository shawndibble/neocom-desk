# Scope decisions — Fitting implants: one control, the set decides the basis

_Recorded 2026-10-04._

- **A Fitting's numbers are on its own implant set whenever it carries one,
  and on the active Character's clone otherwise. There is no separate
  toggle.** The "My clone / Fitting's" select and the "Set implants…" button
  were two controls for one choice. The select's popover listed nothing, so
  "Fitting's" always read as empty. Meanwhile the editor seeded itself from
  the clone and flipped the select on its first change anyway. A
  session-only override that kept a set while showing clone numbers went
  with the toggle; nobody could see it was there.
- **One chip names what is in play: "My clone", "Custom · N implants, N
  boosters", or "None".** It opens the Implants & boosters window. A change
  there saves the set and puts the stats on it, as before. The window's
  "Use my clone" drops the set, which is the only way back to the clone. It
  is offered only with an active Character, because without one there is no
  clone and the stats are on the set or on nothing.
- **The editor still starts from the clone's implants.** That way, adding a
  booster on top of the clone keeps the clone's implants in the numbers. The
  multibuy list and price leave out any implant the active clone already
  has (PR #2564), so the seeded copies are never priced or listed as
  purchases.
