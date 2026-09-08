# Scope decisions — A filled sell order lands on the transaction, not the orders tab

_Recorded 2026-09-08._

- **`marketOrderFilled` opens Market's Transactions view, not Open Orders.** A
  filled order has by definition left the open list, so the tab this alert used
  to land on is the one place the thing it is announcing is guaranteed not to
  be. Transactions is where the fill itself is written down — what sold, how
  many, at what unit price, to whom. This rules out reading `NOTIFICATION_ROUTES`
  as "the page this event's data lives on"; it is "the page that answers the
  question the alert just raised".
- **A notification's destination may depend on its subject, not only on its
  event.** `notificationUrlForSubject` adds `?highlight=<typeId>` for this one
  event, and the Transactions panel scrolls that row into view and pulses it.
  Every other event ignores the subject and resolves exactly as before. This
  rules out a second routing table, and it rules out per-fire routing becoming
  the default — an event earns it by having a subject the destination can
  actually be narrowed to.
- **The feed row stores the item id, never a finished URL.** Nothing else on a
  row identifies the item: the Occurrence Key is the order id and the copy is a
  rendered sentence. Storing `typeId` keeps `notificationOptions.ts` as the one
  place that knows what the app's routes look like — a URL frozen into a row
  would rot the next time a tab moves, and this table keeps rows for months.
  Non-indexed, so no `db.version()` bump; it syncs alongside the copy.
- **Occurrence Keys did not move.** The copy a calendar or market alert carries
  grew; its identity did not. A key that moved with the copy would file a second
  feed row against an occurrence already synced under the old one and
  re-announce it on every device that pulls. Pinned in `occurrenceKey.test.ts`.
- **The highlighted row is the newest sell of that item, and that is the best
  available answer.** ESI's wallet transactions carry no order id, so there is
  no key linking the order that filled to the rows that paid it out. A large
  order fills as several transactions, which sort adjacently by date, so landing
  on the newest lands on the group. This rules out promising the alert points at
  one exact transaction.
- **The highlight is spent on arrival.** The `highlight` param is latched on
  mount and immediately dropped from the URL — including when nothing matched,
  since the fill can be newer than the cached transactions or older than the
  page cap. This rules out a reload or a tab round-trip pulsing again, and rules
  out a stale link pulsing a different row once the cache catches up.
