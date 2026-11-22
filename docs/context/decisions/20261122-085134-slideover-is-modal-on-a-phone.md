# Scope decisions — SlideOver is modal on a phone (issue #6557)

_Recorded 2026-11-22 · issue #6557._

- **`SlideOver` is a modal dialog at phone width (`useIsPhone`), non-modal above it.** The panel is full-width on a phone, so keeping the page behind it reachable only let focus escape under it. Desktop keeps the live page beside the panel. Rules out a focus trap on desktop.
