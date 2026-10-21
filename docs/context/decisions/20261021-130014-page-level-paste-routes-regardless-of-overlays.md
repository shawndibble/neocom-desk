# Scope decisions — Page-level paste routes regardless of overlays

_Recorded 2026-10-21._

- **The page-level paste router steps aside only for a paste that lands in a field.** An open dialog, sidebar, menu or drawer no longer blocks it, and neither does a field that merely kept focus after the pilot moved on. This supersedes the "or while an overlay is open" half of the 2026-10-01 decision on page-level paste (`OVERLAY_SELECTOR`), which stays in force for the single-key shortcuts. The overlay guard made a paste do nothing until the pilot closed things or clicked around, and a stale overlay or focus made it intermittent. A dialog's own import box is a field, so it keeps its own paste. In a real browser a paste's target is the focused element, so the old `document.activeElement` check only ever added false skips.
