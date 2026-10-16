# Scope decisions — Mail editor: Tiptap, view switch above the surface, size presets

_Recorded 2026-10-16._

- **The editor is Tiptap, not hand-rolled.** The user asked for a library over a hand-built contenteditable; ProseMirror's Android/iOS soft-keyboard and IME handling is the reason. ADR `0022`. `eveMarkup.ts` stays the wire authority: nothing the editor holds is sent without going back through parse/serialize.

- **The Preview ⇄ Source switch sits directly above the writing surface, not in the keyboard-docked bar.** The bar stays a pure formatting row; the switch is always visible and not scrolled out of reach. It is inside the body editor (the seam owns it), so the composer's label and counter row is unchanged.

- **Source view keeps the bar for wrapping, minus Clear formatting.** Bold, italic, underline, colour, size and link wrap the selection in tags, Table inserts empty pipe rows; Clear is disabled with a tooltip because it would have to untangle tags around the selection.

- **Size steps are Small 10px, Normal (no tag), Large 16px, Huge 24px**, relative to the reader's 12px default. A guess until the test mail confirms how the game scales `<font size>`; the values live in `MAIL_SIZE_PRESETS`.

- **Table cells hold plain text.** Pipes inside a cell are sent as `¦` and newlines as spaces, since a pipe row has no escape. Formatting inside a cell in a loaded Forward is dropped.

- **Drafts carry `format: 'markup'`.** A row without it was saved by the plain editor; it is escaped on load so `< > &` in it never turn into tags.

- **Reply/Forward now show the live counter and block Send past 10,000**, as New Mail does.

- **The format bar shows only while the body editor has focus** (and while a sheet is open). On a phone it is fixed above the keyboard only when the keyboard is up; otherwise it sits in the flow above the surface, so it never covers Subject, recipients or the bottom tab bar.

- **Source view disables the "back to default" controls** (Default colour, Normal size, Remove link, Clear formatting) rather than faking them, and shows a live note while the markup contains something the safe subset will remove. Send is not blocked; the sent body is the sanitized one.
