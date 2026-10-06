# Scope decisions — Character filter: form rows use variant=field, not the icon-only phone trigger

_Recorded 2026-10-05._

- **Exception to `20260927-072408-character-filter-narrowed-to-this-all-mobile-trigger.md`:
  the icon-only phone trigger stays for header rows, but a settings form row
  uses `CharacterFilterControl variant="field"`.** An icon-only trigger has no
  label text and no caret, so as a form control (Settings > Characters,
  "Default characters shown") it read as a blank square at 390px, against
  DESIGN.md §6c ("a box sized like a field"; `CaretDown` opens a list). The
  field variant shows the value as text with a caret at every width and gets an
  accessible name of "<setting>: <value>". Header callers are unchanged.
