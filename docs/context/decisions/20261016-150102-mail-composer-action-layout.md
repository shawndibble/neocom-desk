# Scope decisions — mail composer action layout

_Recorded 2026-10-16._

- **Close sits top-right in the header, Send bottom-right in a footer row (Discard draft / Cancel bottom-left), the same for New Mail, Reply and Forward.** Per the user's request; supersedes "Close top-left, Send top-right" in `20261016-124635`. On a phone the footer is pinned to the bottom of the full pane so Send is reachable without scrolling, and lifts above the keyboard-docked format bar (content, footer, bar) rather than hiding under it (superseded: the bar no longer docks, see `20261016-183802-mail-format-bar-sits-at-the-top-of.md`).
