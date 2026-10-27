# Scope decisions — Compare drawer is full-screen on phones; Attributes stays a matrix

_Recorded 2026-10-02._

- **Below `md` an open Compare drawer is a full-screen sheet.** Round 8's
  "beside the order book, never covering it" holds on desktop only: on a
  phone the 280px strip above the bottom nav showed about one item, and there
  is no room to read an order book beside it anyway. No resize bar or
  Expand there; Clear all moves into the header's overflow menu so the
  header stays one row.
- **Prices uses the dense two-line card on a phone** (name + best sell, then
  buy · spread · net · volume), with the phone sort picker, instead of the
  eight-line labelled card.
- **The Attributes view stays a real matrix at every width**, reversing
  #1128's below-`sm` stack. The stack labelled every line with an item name
  truncated to the same 6.5rem gutter, so variants of one item were
  indistinguishable. Instead: words every name shares move to the header's
  corner, columns narrow so ~5 items fit 390px, more scroll sideways under
  the pinned attribute column, and "Differences only" (on by default) hides
  attributes every item agrees on. Categories collapse from their heading.
- **Removing an item is a small "×" on its icon's corner**, in Prices rows
  and Attributes column headers alike, always visible (no hover on a phone),
  with its hit area padded to 44px. It replaces the Prices remove column.
- Not done: best-value highlighting per attribute row (needs each
  attribute's higher-is-better direction, still deferred per #146), and
  category jump chips (collapse plus Differences only already keep the list
  short).
