# Scope decisions — Contacts stacks on a phone now that it carries corp and alliance

_Recorded 2026-09-12._

- **Contacts drops `responsive="table"` and stacks below `sm` like every other
  table.** The opt-out was justified by the column set: four columns, three of
  them a short word or a single icon, which fit a 390px screen unaided. The
  Corp / Alliance column breaks that — it prints two entity names, each of
  which can run past the width the whole table used to occupy. Keeping real
  columns would mean truncating the names to a few characters, which is the
  one thing that column exists to avoid. Stacking it costs the side-by-side
  scan on a phone and keeps the names legible; the scan survives at every
  width above `sm`, which is where a contact list is actually worked through.

- **The "also via" standing tag lives in the Corp / Alliance cell, never in
  the Standing column.** It is a _different_ entry of yours — one on the
  pilot's corp or alliance — and EVE applies the personal entry first, so it
  never overrides the row's own standing. Beside the entity it comes from it
  reads as "you have this corp at -10". In the Standing column it would read
  as a second opinion about the pilot, which is what it is not. This rules out
  a combined "effective standing" column on this page: every row here has a
  personal entry by definition, so the resolved value would always be the
  number already printed.

- **"Where is this contact now" is current affiliation only — no history.**
  ESI's contact rows carry no added-at field, so "this pilot left the corp you
  added them from" could only mean "changed since this device first saw them".
  That is a local observation, not a fact about the contact: a fresh device
  reports drift for nobody, and a device back from a fortnight misses every
  move made while it was away. It would also need a store that is neither
  API-derived nor editable-synced. Deferred rather than shipped behind a
  caveat.
