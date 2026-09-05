# Scope decisions (round 55) — Mail subject/sender search (issue #416)

_Recorded 2026-09-04 · issue #416._

- **Round 18's "no subject/sender search" is reversed.** Its own rationale —
  "once mail splits across up to 5 buckets, no single bucket is likely to need
  searching within it" — assumed a bucket stays small. Round 22 then added
  `last_mail_id` pagination ("load more" can lengthen the underlying list well
  past ESI's 50-most-recent page), and this same round adds a rendered-list
  cap specifically because that list can now get large enough to be worth
  capping. Both together undercut round 18's premise, so the search box this
  round adds is a correction, not a second look at a settled decision.
- **Search matches subject or resolved sender name, case-insensitively**
  (`mailSearchMatches`, `engine/mail.ts`), composed with the existing tab and
  Custom-Label filters (AND) rather than replacing either — the three
  narrowing mechanisms stack the same way tab-and-chips already did in round 22.
- **The rendered header list is capped, independent of the fetch/pagination
  cursor.** `capHeadersForDisplay` truncates only what gets mapped into `<li>`
  rows, after every filter; `loadMoreMailHeaders`'s `last_mail_id` cursor still
  derives from the full merged header list, never the capped view — capping
  the DOM list and capping what "load more" can still reach are different
  concerns, and conflating them would have made further pages unreachable
  once the display cap kicked in.
