# Scope decisions — An alert lands on its row, not just its page

_Recorded 2026-09-08._

- **A notification that names a row deep-links to it, and the table scrolls
  there and pulses it.** Opening the right page still leaves the pilot scanning
  a table for the thing they were just told about. `SUBJECT_ROUTES` is the one
  place an event says "my destination depends on what I was about"; it carries
  both how to find the subject on the fire and how to put it in the URL, so a
  new event is one line rather than two edits that can disagree. This rules out
  reading `NOTIFICATION_ROUTES` as the whole answer to "where does this alert
  go".
- **The bar for an entry is that the row is _actually there on arrival_.** Five
  events clear it: `marketOrderFilled`, `walletBalanceChanged`,
  `contractAccepted`, `industryJobComplete` and `corpMemberJoined`.
  `corpMemberLeft` is the pointed exclusion — the roster no longer lists them,
  so a highlight would name a row that cannot exist. The rest are excluded
  because their destination is not a table at all: mail, the skill tree, the
  colony cards, the corp board, the calendar. A key matching no row is
  harmless; an entry that can _never_ match is a promise the mechanism cannot
  keep. This rules out wiring an event because it happens to carry an id.
- **The highlight lives in `DataTable`, not in each panel.** The component
  already owns `rowKey` and the DOM the row sits in, so it owns finding the row,
  scrolling to it and pulsing it; a panel opts in with one prop. The first
  version of this had a panel-local ref, `querySelector` and reduced-motion
  check, which every new caller would have copied. This rules out a
  scroll-to-row helper that callers wire up themselves.
- **The scroll depends on the rows, not only on the key.** The key is in the URL
  before the fetch resolves, so an effect keyed on the id alone fires against an
  empty table and never runs again. Scrolling to the same element twice is
  harmless; missing it entirely leaves the reader where they landed.
- **`?highlight=` is spent on arrival, matched or not.** `useHighlightParam`
  latches the value and deletes the parameter immediately, so a reload or a tab
  round-trip does not pulse again, and a link left armed cannot pulse a
  _different_ row once a cache catches up with newer data. This rules out
  treating it as view state that survives navigation.
- **The stored subject is an id, and the event says what it means.** A journal
  entry id, a contract id, a job id, a member's character id — one
  `NotificationFeedRecord.subjectId`, interpreted by whichever `SUBJECT_ROUTES`
  entry matches the row's `eventId`. A field per kind would repeat the six-file
  edit `typeId` already cost. It is still an id and never a finished URL, so
  `notificationOptions.ts` stays the one place that knows the app's routes.
- **`typeId` is read but no longer written.** It shipped for one release as an
  item-type id only; rows already stored and already synced keep their deep link
  through a `subjectId ?? typeId` fallback. This rules out a `db.version()`
  bump — neither field is indexed — and the fallback can go once no device is
  plausibly still holding one.
- **A contract past the row cap uncaps the list rather than being spliced in.**
  An accepted contract is not necessarily a recent one, and a row that is not
  rendered cannot be scrolled to. Inserting it into a capped list would show it
  out of the order the table claims to be in.
