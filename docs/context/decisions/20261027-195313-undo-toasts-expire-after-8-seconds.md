# Scope decisions — Undo toasts expire after 8 seconds (issue #5334)

_Recorded 2026-10-27 · issue #5334._

- **A toast with `undo` expires after 8 seconds.** Supersedes the "Undo toast is
  persistent" line of `20261011-082556-overview-customize-flow-details.md`. The
  clock pauses while the toast is hovered or has focus inside, and resumes with
  the time left, so the timer stays adjustable (WCAG 2.2.1). Close button,
  Escape, the next toast and a route change still close it sooner. Every Undo
  reverses a change that is also easy to redo by hand, and the owner chose it.
  An `action`-only toast ("Open", "Appraise") is unchanged: it stays until
  dismissed. A toast with both follows the Undo rule.
