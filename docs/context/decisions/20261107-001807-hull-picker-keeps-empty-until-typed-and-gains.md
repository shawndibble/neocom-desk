# Scope decisions — Hull picker keeps empty-until-typed and gains can-fly marks (issue #6011)

_Recorded 2026-11-07 · issue #6011._

- **The hull picker still lists nothing until the pilot types.** Decision
  `20260924-215855` stands: an empty query shows "Search for a hull to begin.",
  never a list of flyable hulls. Ships › Tree is where every flyable ship is
  shown.
- **Each listed hull carries the Ship Tree's can-fly mark for the active
  Character.** It uses the same `FlyDot` and status as the Ship Tree: a dot
  means can fly, a ring means can't fly yet, a star means Mastery V. An Ω follows
  a hull the pilot can't fly yet when the pilot is an Alpha and the hull's class
  needs skills past the Alpha cap (`classNeedsOmega`). With no Character, or
  before the tree and skills load, the hull has no mark. A guess is never shown.
- **Every Popular fits row ends with a can-fly verdict.** The verdict is "Can
  fly", "Missing N skills" ("· Omega only" for an Alpha who needs a skill past
  the cap), or "Skills unknown". It counts the same way as the editor's Missing
  skills chip: the hull, modules, charges, drones and fighters, at Effective
  Skill Levels. With no Character, the row has no verdict. A one-line caption
  says where the fits come from.
