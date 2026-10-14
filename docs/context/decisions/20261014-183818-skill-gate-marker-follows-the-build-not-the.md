# Scope decisions — Skill-gate marker follows the build, not the advice

_Recorded 2026-10-14._

- **The marker beside a name means "this row is being built".** A gated bought row no longer carries the lock and skill text next to its name, even when the cost call is "build". This supersedes the 2026-10-05 decision (`20261005-125446-skill-gate-marker-shows-on-bought-rows-and.md`) on where that row's marker sits.
- **A gated bought row gets a text-free lock after its Build instead button.** The icon-only `SkillGateMarker` (`lockOnly`, warning-coloured, unlike a quiet row's dim lock), same popover. It shows whenever the blueprint is gated, whatever the advice says: the lock sits on the action it blocks.
- **The plan header's "skills short" counts only what the plan builds.** The product itself plus every material set to build (`mergeSkillGates`): each distinct missing skill once, at the highest level any build needs. Materials the pilot buys never count, so a plan that buys everything shows only the product's own gate. This narrows the 2026-09-22 decision's header behaviour.
