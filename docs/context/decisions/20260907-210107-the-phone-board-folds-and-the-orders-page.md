# Scope decisions — The phone board folds, and the Orders page takes a filter from its URL

_Recorded 2026-09-07._

Both items were carried as deliberately-deferred scope in #579 and are named as
such in its merge commit. This finishes them.

## The fold

- **Two cards stay whole below `sm`; every other domain drops to one line.**
  From the mockup (`design/overview-triage`, tagged): about three cards fit
  above the fold at 390px, and the third slot buys more as a summary of
  everything left than as a third card. Rules out both the wide board on a
  phone and a phone board that hides anything.

- **A folded line is not a shortened card.** A card can afford three counts and
  let the reader weigh them; a row has to pick the one fact that decides
  whether to tap it. `boardSummary.ts` ranks the same way its
  `boardSeverity.ts` sibling does and prints the worst true thing.

- **Every summary takes its domain's nullable snapshot, not the array inside
  it.** An unlanded read, a lapsed grant and a quiet domain all arrive as an
  empty list, and a row is the only thing its domain says on a phone. Printing
  "Nothing running" for the first two is the silence the board was rebuilt to
  remove. `ordersSeverity` and the route's `orderRows` became nullable for the
  same reason.

- **Alerts is pinned to the folded list and never ranked against the cards.**
  It is device-wide rather than one Character's, and its volume class is
  different from everything else on the board — which is why it has a column
  rather than a card. Ranking it would let one loud evening take both top
  slots, the exact failure the column exists to prevent. The mockup folds a
  70-unread alerts row while planetary and orders keep their cards.

- **The fold is decided in JS, not CSS.** `order-N sm:order-none` was the right
  tool for a reordering; this changes structure — a card becomes a row and the
  alerts column goes away — which is what `useIsNarrow`/`useIsDesktop` already
  exist for elsewhere. `NARROW_ORDER` and the `className` prop that carried it
  are gone with it.

- **`useIsPhone` is a third breakpoint hook, not a reuse of `useIsNarrow`.**
  That one is the `md` threshold and asks whether a filter row costs more than
  the list it filters; this asks whether the board's cards still fit side by
  side. Folding at `md` would collapse four cards into a list at 700px, where
  the grid is happily showing two columns. It keeps the max-width phrasing
  `useIsNarrow` documents, so the stubbed `matchMedia` reads as "not a phone"
  and every existing board test still queries the wide layout.

## The deep links

- **The Orders page reads `problem` and `character` from its URL.** Repeated
  params, not comma-separated: `URLSearchParams` reads and writes that shape
  natively, so there is no delimiter to escape. Only these two — the page has
  eight filter fields, and a vocabulary for the six nothing links to yet would
  be invented on spec.

- **A tile's link carries the character as well as the problem.** The board
  counts one Character's orders and the page fans out across all of them, so a
  tile reading "21 undercut" opening an unfiltered page would put that 21 next
  to a list of thirty. Rules out linking to the bare page "and letting them
  filter".

- **One module writes the URL and reads it** (`openOrdersHref` /
  `openOrdersFilterFromParams`, both in `openOrdersFilter.ts`), with a
  round-trip test. Two halves of a vocabulary in two files drift, and the
  failure is silent — a link that quietly filters to nothing.

- **Read once on mount, never synced back.** Same as Wallet's `?tab=` and
  Market's own `?section=`. The URL states where the reader arrived, not where
  they have got to since; syncing would rewrite history on every chip removed,
  and a stale param nobody reads again costs nothing. `activeFilterChips`
  renders each applied value as its own removable chip, so the narrowing is
  visible and reversible.

- **An unreadable param is ignored, never an error.** A URL is typed, shared,
  bookmarked and edited by hand; the page it asked for is still the right
  answer.

- **A zero tile is not a link.** The same rule that already drops a zero's tone
  and glyph: a link is the strongest "look here" a tile has, and behind this
  one is a page filtered down to nothing. `—` (the read failed) is not a link
  either — the count it would carry is exactly what nobody knows.
