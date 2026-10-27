# Scope decisions (round 40) — the corp Members roster

_Recorded 2026-09-03._

- **The page exists to surface silence, so it opens sorted by silence.** Every
  other view answers "what do I have"; this one answers "who is here, and are
  they still here". `Last seen` prints an _elapsed span_ rather than a date and
  sorts on that span descending, so the longest-absent member is at the top
  before anything is clicked. Sorting on the date instead would lead with the
  people still playing, which is the question nobody opened the page to ask.
- **`/corp/members` hides whole, where `/corp` degrades panel by panel.**
  `membertracking` declares `Director` in ESI's `x-required-roles` and nothing
  else, so `canReadMembers` has exactly one role behind it and the page has
  exactly one gate. `/corp` degrades because its panels answer to four
  different roles; there is no partial state here to render, and an Accountant
  gets the explanation rather than a shell over a permission no login can
  grant. The Members entry in `CorpSubNav` is absent for them too — Corp Access
  `ready` is a gate on the section, not a promise about a view inside it.
- **A member who has never logged in is counted from their join date.** "Last
  seen a long time ago" and "joined and never played" are different facts, and
  the table says `Never` for the second rather than printing a span from a date
  that is not a login. But they are dark all the same, and letting them fall
  out of the count for want of a logon to subtract from would hide exactly the
  recruit the page exists to surface.
- **The Roster Diff is pure and lives in `engine/corp/members.ts`.** #299's
  Member Joined / Member Left events read the same function rather than
  reimplementing it inside a poller. `prev === undefined` means "no baseline"
  and reports no change at all — the alternative is announcing all two hundred
  members as joiners on a first visit — while an empty _array_ is a real
  observation of an empty corporation. That is `engine/notificationDiffs.ts`'s
  reading of the same distinction.
- **The Roster Baseline is per observer, not shared.** It is built on
  `features/notifications/pollerState.ts` — the app's answer to "persist the
  previous observation, per Character, device-locally" — but under a key of the
  page's own. Sharing one row with #299's ten-minute poll would let a
  background poll consume a change moments before the user opened the page, so
  the summary would almost never appear. What the two share is the pure diff.
- **The corporation id is stored inside the baseline and checked on read.** The
  store is keyed by the reading Character, and a Character can change
  corporation — at which point the stored roster is not stale, it is a
  different corporation's, and diffing against it would report its whole
  membership as having left.
- **A roster that could not be read leaves the baseline alone.** Overwriting it
  with nothing would silently swallow every change made since the last
  successful read.
- **Names are resolved in bulk, and the id space is split to keep it that way.**
  `postUniverseNames` is the one bulk resolver and answers 404 for the _whole_
  batch if any id is unresolvable, so Upwell structure ids (>= 1e12) are
  separated out before the call and asked for individually — deduplicated, so
  the cost is the number of distinct structures a corp docks in, not the number
  of members. `contractLocationName.ts` tries both endpoints in turn instead,
  which is right for its one id and wrong for two hundred.
- **Time remaining stays unclamped in the engine here too** (round 39's rule):
  a client clock ahead of ESI's would otherwise collapse every skewed member
  into a tie at zero. The clamp is at display, where a negative span renders as
  "just now".
