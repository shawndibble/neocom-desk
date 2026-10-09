# Scope decisions — Survey chat message is an open box, sized in pixels from EVE's chat font

_Recorded 2026-10-09._

- **The box is sized in pixels, not characters.** EVE's chat font is proportional (an `i` is
  4px, an `m` 10px, a space 7px, every box and block character 8px), so rows of equal character
  count ended up tens of pixels apart. `src/engine/survey/chatFont.ts` holds the measured
  widths, taken from screenshots of `║` + one character repeated + `║` pasted into chat at font
  size 12. The alphabets and the digits add up to their measured whole rows, and a real Left
  row's right edge landed where the table predicted. A different chat font size scales every
  width, so the sizing is exact at the measured size only.
- **The right side is open.** A closed box (`╗`, `║`, `╝`) was tried first: even padded to the
  pixel it ended a few pixels ragged, because spaces and `█` come in 7px and 8px steps, and a
  hard right edge shows every pixel of it. Each rail tapers off instead, through the dashed
  characters `╌┄┈`, which draw in EVE (a `▓▒░` taper was a hard jump from a thin line to blocks and
  was dropped). The frame is single-line (`┌ ─ └ │`), lighter than the double line (`╔ ═ ╚ ║`) it
  replaced.
- **A rail is never shorter than the content under it, and under two characters longer.** The
  rails are as long as the ore line, or as the link's rail when the link is longer, rounded up to
  a whole `─`; the bar rounds down so it never outruns them. The ETA is set into the top rail and
  the link into the bottom one, each centred between the corner and the taper.
- **The message carries no bold.** The ETA time was bold, but a bold glyph's width was not
  measured, and a wrong width would break the sizing. Bring bold back only with a measurement.
- **The message starts with a "Neocom Desk Report" heading line.** Chat puts the speaker's name
  before the first line of a message, which pushed the top rail's corner out of line with the
  rows below it. The heading takes that spot and the box starts underneath it.
- **The ore line is capped in pixels, not characters: 300px (`MAX_ROW_PX`),** replacing the
  60-character cap. Measured in game: boxes with rows of 267-274px fit a default chat window, and a
  box with 367px rows wrapped (top rail and ore line both), so the window holds about 335px. 300px
  leaves room to spare; a long ore name drops the second ore first. A link longer than the cap
  still lengthens the rails past it, as the link cannot be shortened.
