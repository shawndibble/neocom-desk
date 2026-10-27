# Scope decisions — The Scheduled Push badge, and the one row it refuses to claim

_Recorded 2026-09-07._

- **Settings marks which Notification Events actually reach a closed app.**
  Two delivery models sit in one undifferentiated list: an event with a
  knowable future instant is projected and pushed by the backend up to 72
  hours ahead, and everything else is only observable by a poll, which needs
  the app open. Nothing on the page said which was which, so every row read as
  the same promise — and the corp rows carried a "best-effort, app must be
  open" disclosure that implied, by contrast, that the others were not. A
  `Broadcast` glyph beside the label carries it, tooltip and `aria-label`
  alike, and it is deliberately not another bell: the Bell family already
  means "the browser-notification channel", and this is a property of the
  event, not of a channel.

- **The badge's copy states the conditions, not just the capability.** Push
  needs notification permission, and on iPhone and iPad it needs the app
  installed to the home screen (ADR 0007) — facts `extractorExpiringHint` and
  `installRequiredNotice` already carry elsewhere on this page. A badge that
  promised delivery without them would be the one place here claiming more
  than the rest of the page does.

- **`eveNotification` is on the projection engine's list and still gets no
  badge.** `PROJECTABLE_EVENT_IDS` includes it because a structure's
  reinforcement _exit_ has a knowable future instant — but that is one
  sub-case, and the row covers all 26 types on the Notification Allow-List.
  Badging it would tell a pilot who enabled `WarDeclared` that it reaches them
  with the app closed, which is false. The panel therefore filters the engine's
  list rather than rendering it, and the test asserts the _absence_ of the
  badge on that row as deliberately as it asserts its presence elsewhere: the
  filter looks like a simplification waiting to be undone.

- **`ProjectableEventId` is derived from `PROJECTABLE_EVENT_IDS`, not written
  twice.** The union was a hand-maintained list of the same eight strings that
  the array now holds. With Settings reading the array to decide what to
  promise the user, a second copy that could drift from the first is exactly
  the kind of divergence that puts the badge on a row that cannot honour it.
