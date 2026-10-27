# Scope decisions — Across characters reads cached contacts and fetches on request

_Recorded 2026-09-12._

- **The Across-characters tab is built from what each Character last cached,
  and fetches every Character only when the reader asks.** Opening a tab must
  not cost a pilot with a dozen alts a dozen paginated contact fetches against
  the ESI error budget. The consequence is real and must stay visible: a
  Character never opened on this device has no cached list and reads as
  holding no contacts, which looks like a gap rather than an unknown. The tab
  says so in plain words under the table and puts the live fetch one click
  away, rather than papering over it or refusing to show anything.

- **A row shows every distinct standing its holders gave, never an average or
  a "winner".** Two Characters at +10 and -10 have no meaningful midpoint, and
  which of them is right is the reader's judgement, not the app's. Seeing both
  tags side by side is the whole reason the row exists.

- **A single Character gets no tab at all, and `disagrees` is always false for
  one list.** One contact list cannot disagree with itself, so the comparison
  would only restate the first tab. This rules out using the tab as a plain
  "all contacts" view.

- **The tab shares the page's search box and type chips, and ignores its
  standing chips.** A name or a type means the same thing on either tab. A
  standing does not: a row here carries several. Rather than silently dropping
  a filter the reader can see is set, the tab carries its own
  "Only disagreements" chip, which is the narrowing this view actually wants.
