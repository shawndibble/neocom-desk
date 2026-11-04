# Scope decisions — Slash joins ? and Esc as a single-key shortcut, focusing the page search

_Recorded 2026-11-03._

- **`/` is a third single key, beside `?` and `Esc`.** It puts the cursor in the
  page's search box with its text selected: the `FilterBar` one, else the first
  visible search box in `<main>`. This amends
  `20261016-121137-shortcuts-become-g-sequences-with-an-off-switch`, which kept
  only `?` and `Esc` single. `/` is the search key readers already know from
  GitHub, YouTube and Gmail, and it is a punctuation key rather than a letter,
  so a stray press or speech input does not fire it, which was the reason page
  keys became `g` sequences. It still obeys the Single-key shortcuts switch,
  never fires from inside a text field or an open overlay, and on a page with
  no search box it is left to the browser (Firefox's quick find).
- **The `/` key cap shows only on the box `/` will focus**, while that box is
  empty and unfocused. It is not shown on touch screens, which have no `/` to
  press, or with the switch off.
