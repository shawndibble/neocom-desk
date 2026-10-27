# Scope decisions — Fitting stats column grouped; Pilot and Situation move to side panels (issue #3978)

_Recorded 2026-10-16 · issue #3978._

- **The stats column holds only the ship's numbers, under three static group
  labels.** Damage (Offense, Applied DPS, Drones, Fighters), Tank (Defense,
  Capacitor), Ship (Navigation, Targeting, Fitting, Support out, Mining, Fleet
  boosts, Price). The labels are plain small-caps headings, not toggles: each
  section keeps its own open/closed row and its id, so
  `statsSectionsPreference.ts` keeps every pilot's choices. A group with no
  section shown has no label. This rules out collapsing a whole group, which
  would be a second open/closed state over the one each section already has.

- **Who flies it and what it flies in move to two side panels, opened from
  triggers on top of the column.** Pilot: the missing-skills chip or
  skills-unknown note, Implants & skills, What to train, Your Characters.
  Situation: Tactical mode, Abyssal, Projected effects, Overheat all. The
  "Stats as …" heading goes; the price total stays at the trigger row's right
  end. A right `SlideOver` on desktop (the page stays live), a full-height
  sheet on a phone, as every other drawer (DESIGN.md §6c).

- **A non-default condition reads on its trigger.** These move every number
  in the column, so they may not hide behind a closed panel: the Pilot
  trigger carries the skills basis, "N missing" and "skills unknown" in the
  warning tone; the Situation trigger carries the weather the figures are in
  (or "Normal space"), a non-default Tactical mode, the projected ship count
  and "overheated" (warning tone).

- **A closed panel works nothing out.** Its body mounts only while it is open,
  and a section's body only while that section is open, so the Abyssal
  weather's delta (#3977) still runs only while both are.
