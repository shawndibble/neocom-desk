# Scope decisions — Skills plan editor: Assumptions group and Skills to buy placement

_Recorded 2026-10-08._

- **Alpha clone, What-if implants, Booster and Skill injectors share one closed-by-default "Assumptions" disclosure.** They change (or are costed under) every number on the page, so the closed row carries a one-line summary of what is set ("Alpha · +5 implants · Booster") or "Defaults". Re-organisation only: same controls, strings, state and accessible names.
- **Skill injectors stays under Assumptions, as in the approved mockup.** Flagged as an open question there: it shows "Large Skill Injectors needed" and a price, which is arguably an output like Skills to buy and could sit beside it instead. Not decided here; moving it is a one-line change in `PlanEditor.tsx`'s `toolSections`.
- **Skills to buy sits directly under Attributes in the sidebar.** It is an output, not a setting, so it no longer comes last.
- **Below `lg`, Skills to buy is its own row outside the collapsed Plan tools**, with the total beside the title and a leading caret that expands it in place (a trailing chevron would promise navigation, DESIGN.md §6c). It is the same `SkillsToBuyPanel` (`collapsible`), and the Plan tools panel no longer holds a second copy there. The mockup's collapsed sub-line ("6 priced · 2 without a price") is not built: the "N skills without a price" note shows once the row is open, which avoids a new string for a count nothing else shows.
