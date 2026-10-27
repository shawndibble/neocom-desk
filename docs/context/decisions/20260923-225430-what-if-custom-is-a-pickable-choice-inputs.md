# Scope decisions — What-If Custom is a pickable choice; inputs show only under Custom (issue #1413)

_Recorded 2026-09-23 · issue #1413. Supersedes the "Custom is a readout of the values, never something to choose" and "the five inputs are always visible" rules in `20260902-202141-per-attribute-what-if-implants.md`._

- **Custom is always offered in the What-If Implants picker.** Picking it freezes
  whatever the selection in force resolves to ("Current" against the live
  implants) into a custom set, so no plan number changes until a slot is edited.
  Editing a slot still flips a preset to Custom, as before.
- **The five per-attribute inputs render only under Custom.** Under a preset a
  single dim line reads the resolved bonuses ("INT +0 · MEM +3 · …"), keeping
  what the plan is costed against legible without five editable fields that
  most players never touch and that made the section the tallest in the sidebar.
