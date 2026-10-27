# Scope decisions — Go to button opens the command palette

_Recorded 2026-10-02._

- **Supersedes `20260929-235256-command-palette-opens-by-shortcut-only`.** The
  palette gets on-screen openers again. A shortcut nobody can see is a feature
  most pilots never find, and the phone, with no hardware keyboard, could not
  reach the palette at all. NN/g's guidance on accelerators (“those users who
  never discover the accelerator should be able to complete the same task in
  another way”) and on visible search drove the reversal; the owner accepted it.
- **Desktop: a “Go to…” button at the top of the rail, showing the chord.** It is
  a button that opens the palette, not a second search field. It says “Go to”,
  not “Search”, and carries a caret rather than a magnifier, so it does not read
  as a filter for the page underneath: a page's own search box stays in that
  page and only filters that page. The palette's footer says the same in words.
- **Phone: a search field at the top of the More sheet** opens the palette. It
  closes the sheet first, because the host never stacks the palette over
  another open dialog. The phone gets no other opener: no button atop a page,
  so the palette still costs a page no room until summoned.
- Ctrl+K / Cmd+K keeps working everywhere it did.
