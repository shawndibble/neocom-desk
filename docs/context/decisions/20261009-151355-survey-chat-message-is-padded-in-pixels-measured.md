# Scope decisions — Survey chat message is padded in pixels, measured from EVE's chat font

_Recorded 2026-10-09._

- **The box is padded to one pixel width, not one character count.** EVE's chat font is
  proportional (an `i` is 4px, an `m` 10px, a space 7px, `═ █ ░ ║` 8px), so rows of equal
  character count ended up tens of pixels apart. `src/engine/survey/chatFont.ts` holds the
  measured widths, taken from screenshots of `║` + one character repeated + `║` pasted into
  chat at font size 12; the alphabets and the digits add up to their measured whole rows, and
  a real Left row's right edge landed where the table predicted. Padding comes in steps of 8px
  (`═`, `█`) and 7px (a space), with at most one spare space per row, so a row can end up to
  4px off the others. A different chat font size scales every width, so the padding is exact at
  the measured size only; the corners `╔ ╗ ╚ ╝` are assumed 8px, not measured on their own.
- **The message carries no bold.** The ETA time was bold, but a bold glyph's width was not
  measured, and a wrong width would break the padding. Bring bold back only with a measurement.
- **The message starts with a "Neocom Desk Report" heading line.** Chat puts the speaker's name
  before the first line of a message, which pushed the top rail's corner out of line with the
  rows below it. The heading takes that spot and the box starts underneath it.
- **The ore line is capped in pixels, not characters: 416px (`MAX_ROW_PX`),** replacing the
  60-character cap. RockRadar's widest lines are about 52 box-drawing characters at 8px each, and
  they never wrap. A link longer than that still widens the box past the cap. It is a guess about
  the chat window's width; shrink it, and drop the second ore, if a row is seen to wrap in game.
