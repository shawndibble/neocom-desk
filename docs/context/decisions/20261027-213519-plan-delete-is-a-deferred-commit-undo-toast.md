# Scope decisions — Plan delete is a deferred-commit Undo toast (issue #5351)

_Recorded 2026-10-27 · issue #5351._

- **Deleting a Build Plan from the ⋮ menu opens no dialog.** The row hides at once and an Undo toast (8s, paused on hover or focus) defers the real delete; closing it, Escape, leaving the route, `pagehide` or the tab hiding, or being pushed out of a stack of 3 commits it. A confirm dialog for a one-plan delete was friction Undo makes needless.
- **Build Group delete keeps its confirm dialog.** It cascades to many plans, so a deferred commit would hide too much.
- **Production Runs are untouched.** Plan delete never cascaded to them.
