# Scope decisions (round 22) — Mail custom labels & pagination

_Recorded 2026-09-02._

- **Round 18's "Custom Labels are out of v1" and "No `last_mail_id`
  pagination" are both reversed** (issue #161). They were deferrals pending
  an overflow affordance and a cache story, not permanent exclusions; this
  round supplies both.
- **Custom Labels get a chip row, not tab-bar overflow.** Round 18 deferred
  them for want of a "more" menu; a `FilterChip` row beneath the fixed
  five-tab strip is the cheaper answer and reads better — the tabs stay the
  five authoritative System Label buckets, and the chips are visibly a
  second, additive filter surface rather than more of the same thing. Chips
  are absent entirely when the character has no Custom Labels.
- **Tab and chips compose as AND.** The tab picks the System Label bucket;
  selected chips then narrow that bucket to mail carrying any one of them
  (OR within the chips). Both filter surfaces persist across a manual
  refresh.
- **Pagination runs against the unfiltered stream, filtered client-side.**
  `last_mail_id` cursors the whole mailbox, not the active tab — ESI has no
  per-label cursor, and paging a filtered view against an unfiltered cursor
  would stall on a tab whose next match is 200 mails down. "Load more"
  therefore lengthens the underlying list; the active tab and chips re-filter
  it as they already do.
- **A full 50-row page is the only "more may exist" signal.** ESI returns no
  total count, so the control hides once a short page comes back. A failed
  fetch leaves the list untouched and keeps the control available to retry.
- **Names are resolved per page.** `/universe/names` is batched for each
  loaded page, not just the snapshot's first one — otherwise every row past
  the first 50 renders as "Unknown".
