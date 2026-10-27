# Scope decisions — Price History polish: a series token, and no breakpoint on the day list

_Recorded 2026-09-14._

- **`--color-series-order-count` exists, and it reverses the colour decision
  recorded earlier the same day.** That one had the order-count line drawn in
  `text-dim` and said minting a chart-series colour was ruled out. In the app
  it read as a second grey line beside the grey moving average, which is
  exactly the confusion the token set exists to prevent. The reasoning that
  ruled out `warning` and the clock kinds still holds — a data series in the
  caution tone reads as an alert about the data, and a clock-kind hue names
  where a _deadline_ came from — so the answer is one purpose-named token,
  not a borrowed one. One token is not the parallel palette DESIGN.md §1
  forbids; a second would start being one, so the next series to want a colour
  should first try to be told apart by form, the way the moving average is by
  its dash.

- **Nothing gates the per-day list on a viewport width any more.** It was
  visible below `useIsPhone`'s breakpoint and `sr-only` above it. A folding
  phone reports about 1900px unfolded, so opening the hinge failed a max-width
  test written for a handset and the whole list vanished mid-session with
  nothing on screen to explain it. Width was being asked "is this a phone"
  when the real question was "does anyone want these numbers" — and the answer
  to that does not change with the hinge. The list renders at every width;
  only its layout changes, which is `DataTable`'s own CSS collapse and needs
  no JavaScript breakpoint at all. General rule this leaves behind: a
  breakpoint may choose a _layout_, never whether content exists.

- **`DataTable` grew `stackColumns`, rather than Price History hand-rolling a
  card.** The default stacked card gives each field its own line with the
  label pinned in a 7rem gutter, which suits four or five fields of varying
  width and wastes half a phone screen on a row of short numbers. `2` pairs
  them up with the label above the value. It lives on the shared component
  because the next dense numeric table will want it too, and because a
  bespoke card here would have to re-solve the label semantics
  `.dt-stack` already handles.

- **The price axis picks its decimals from the span it covers, not from a
  fixed 0.** Tritanium's whole 30-day range is 3.70 to 4.04 ISK, so every tick
  rounded to "4" and the axis labelled four different heights with the same
  number. Keyed to the span rather than the magnitude, since the span is what
  decides whether neighbouring ticks collapse together.
