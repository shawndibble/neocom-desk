# Scope decisions (round 26) — Skills opens on Plans

_Recorded 2026-09-02._

- **The Skills section opens on Skill Plans, not trained skills.** Planning is
  what a visitor comes to this section to _do_; the trained list is reference.
  `/skills` becomes an index route that redirects (`replace`) to
  `/skills/plans`, and the trained view moves to a route of its own,
  `/skills/trained`. A redirect rather than rendering the plan list at
  `/skills`: one view keeps one URL, which is what every existing "Back to
  plans" link and the editor route already point at. The rail and mobile-bar
  links stay on `/skills` (non-`end` `NavLink`s), so the section highlight
  still covers all three tabs.
- **`SkillsSubNav` puts Plans first**, ahead of Trained and Compare. A section
  that lands on its second tab reads as broken.
- **The list route's detail pane shows the character's current attributes**,
  replacing round 21's "select a plan, or create one" placeholder (issue: that
  box repeated what the list beside it already said). Attributes are the input
  every plan is costed against and the thing a remap changes, so they are the
  reference a planner wants beside the list. The pane stays desktop-only, as
  the placeholder was: below `lg` the list owns the column, and the editor
  takes it once a plan is open.
- **The attribute chips are one component, shared** (`AttributeChips`), rather
  than the trained view's markup copied. ESI reports the _effective_ value, so
  base is what's left once the implant bonus comes off; that arithmetic now
  lives once.
- **A display of the character's sheet never falls back to defaults.**
  `usePlanEditorData` keeps its `DEFAULT_ATTRIBUTES` fallback so the scheduler
  always has numbers, and additionally exposes ESI's own nullable read
  (`attributesResult`) for anything that _shows_ attributes — a failed fetch
  renders unknown, not a plausible-looking sheet.
