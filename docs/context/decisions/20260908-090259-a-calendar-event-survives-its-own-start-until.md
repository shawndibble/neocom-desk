# Scope decisions — A calendar event survives its own start until local midnight

_Recorded 2026-09-08._

- **A started calendar event stays on the board until its local day is over.**
  `GET /characters/{id}/calendar` returns the next 50 events _from now_, so an
  event leaves the response the moment it begins, and the cache replaces its row
  wholesale. A fleet op that runs for four hours therefore disappeared from
  `/calendar` at exactly the hour it was happening. Events read by
  `features/character/calendar.ts` are now the union of ESI's answer and the
  events it dropped only because they have already started today. This rules out
  reading the calendar cache as "what ESI last said" — for this one endpoint it
  is "what ESI last said, plus what it stopped saying for a reason that is not
  about the pilot".
- **Started-or-not is the whole discriminator, and it is enough.** Gone from the
  fresh read _and already started_ means ESI trimmed it; gone _and still
  upcoming_ means it was deleted or the invite withdrawn in game, because ESI
  would have returned it. So absence is only ever forgiven on the started side.
  This rules out retaining by age, by a grace period, or by "keep whatever we
  last saw" — each of which would leave a cancelled event on the board with
  nothing to remove it.
- **Local midnight, not a rolling span.** "Some events start and run for several
  hours" is a statement about a day. A rolling 24-hour window would carry
  yesterday evening's op into this morning, filed under _Today_. Local days for
  `engine/localDay.ts`'s reason: a pilot reading "Today" means their own. This
  rules out a duration-based retention constant, and it keeps the Calendar Map's
  claim about past cells true — nothing is retained into a day that has passed.
- **Retention lives in the calendar data layer, not in either consumer.** The
  `/calendar` map, rail and ticker and the Foreground Poller's calendar domain
  read the same function, so a board that lists a running op while the poller's
  snapshot has forgotten it is not expressible. This rules out fixing it in
  `pollDomains.ts`'s `toSnapshot` alone, which would have left the page wrong.
- **`calendarEventStarting` depended on this to fire at all.** The diff looks for
  an entry whose `startMs` is newly in the past — in a list ESI had already
  dropped it from, which it could only ever win by racing a cache. The event's
  wording change is downstream of the retention change, not beside it.
- **A running event's countdown reads "Started", not "Overdue".** Every other
  kind past its clock really is late; a calendar event past its clock is under
  way, and these rows exist precisely because it is. This rules out reusing the
  one overdue string across all six clock kinds.
