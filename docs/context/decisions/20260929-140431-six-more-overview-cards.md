# Scope decisions — Six more Overview cards

_Recorded 2026-09-29. Builds on 20260929-114130-overview-cards-can-be-hidden-by-the-pilot._

- **The board gains Structures, Moon extractions, Coming up, SP extraction,
  Mail and Price alerts.** Each can be hidden from the edit menu like the
  first six, and each reuses the loader and rules its own page already has.
  None of them invents a second way to fetch the same data.
- **Corp cards appear only for Characters who can read them.** Structures and
  Moon extractions are offered, in the grid and in the edit menu, only when
  `useCorpAccess` is `ready` and grants the matching capability. This narrows
  the board's "every card renders mid-load" rule: while corp access is
  resolving, those two cards are absent rather than loading. That is the rule
  every corp surface follows: a corp card flickering for a pilot with no roles
  is worse than one that appears a beat late for a Director. Their loaders
  check roles and scopes before any corp call, so no pilot fires a request
  that can only 403.
- **On a phone, only the two corp cards compete for the full-card slots.**
  Coming up, SP extraction, Mail and Price alerts are always one folded line,
  like Contracts. Their news fits in a line, and none of them is a deadline
  that should push a real one below the fold.
- **Coming up owns the calendar's share of Next deadline.** It was an
  always-on candidate while calendar had no card. Hiding Coming up now removes
  it from the strip and from its freshness, the same as any other card. Skill
  training is the one clock left that belongs to no card.
- **A structure clock only leads Next deadline when the snapshot can count it
  down honestly.** A timer shorter than CCP's hour-long corp cache may already
  be over, and a dry structure has no instant. The card shows both; the strip
  never ticks them down.
- **Coming up lists calendar events only.** The Calendar page's Coming Up rail
  also carries jobs, colonies and contracts, but each already has a card here,
  and a second row for the same clock could contradict it.
- **SP extraction respects its own switch.** The card always shows spare SP,
  but only flags anything as ready when SP Extraction monitoring is on.
- **Price alerts never price anything.** It reads the Quickbar's targets and
  the alert poller's last reading, and says how old that reading is. A reading
  taken against a target the pilot has since changed is withheld until the
  next poll.
- **Mail counts the whole mailbox.** The number is ESI's `total_unread_count`
  from the labels read. The 50-newest headers only supply the rows.
- **Hidden cards still load.** As before, the loads are unconditional, and
  skipping them would mean reworking `useRouteSnapshot`.
