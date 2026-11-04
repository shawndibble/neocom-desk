# Scope decisions — Show info shows base to skilled values for ships and modules

_Recorded 2026-11-03._

- **Item Detail shows "base → skilled" for ships and fittable modules.** The skilled value is the active Character's Effective Skill Levels plus the implants in their active clone, the same pilot the Fittings page uses and what the in-game Show info shows. Only rows the pilot changes get the arrow; unchanged rows keep one value. Drones, subsystems, charges and everything else show base values only.
- **A ship is calculated as its empty hull; a module alone on a Capsule.** The Capsule has no hull bonus, so a module's skilled value is the pilot's effect alone — never one particular ship's bonus, which would be wrong for every other hull. A mutated module starts from its rolled values.
- **Show info never starts the dogma engine download on its own.** With the engine loaded or cached the skilled values appear by themselves; otherwise Item Detail offers a control that downloads it once. Offline with nothing cached, nothing is offered.
- **No pilot, no skilled values.** There is always an active Character, but when its skills cannot be read (or the profile fails to load) Item Detail shows base values only. It never falls back to All V, which would pass made-up skills off as the pilot's.
