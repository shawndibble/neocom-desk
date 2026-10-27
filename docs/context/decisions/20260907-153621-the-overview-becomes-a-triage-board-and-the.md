# Scope decisions — the Overview becomes a triage board, and the alert feed gets its own route

_Recorded 2026-09-07._

- **A card shows numbers where its items are interchangeable, and rows only
  where each item is genuinely its own thing.** This is the whole redesign, and
  it comes from three facts about real play rather than from taste: twenty-one
  open orders can be undercut at once, colonies are reset in a single sitting
  so a batch of them shares an expiry, and alert volume runs to the hundreds
  across a dozen-odd notification types. A board that prints a row per item is
  therefore unusable on exactly the days it is worth opening. So Open Orders
  and Mining Tax are counts, Planetary is one row per _reset run_, Industry
  keeps real rows because jobs really do differ from each other, and Alerts
  take a column of their own. This rules out the uniform card grid the first
  round of mockups proposed, and it rules out "top N plus a link" as a general
  answer — it is right for industry jobs and wrong for undercut orders, and the
  difference is whether the reader would act on the items separately.

- **The unit of planetary work is the reset run, not the colony.**
  `engine/pi/colonyBatches.ts` chains colonies whose expiries fall within
  ninety minutes of one another into one batch. The window is deliberately
  generous rather than tight: splitting one run in two puts back exactly the
  repetition the grouping removes, while merging two runs an hour apart costs
  the reader nothing, because the row still names the soonest deadline, which
  is when to go. It is chained rather than bucketed so a gradual spread across
  an evening stays one trip instead of being cut at an arbitrary boundary. This
  rules out reusing `EXPIRING_SOON_WINDOW_MS` or the pilot's own expiring-soon
  preference for the job — those answer "is this urgent", a question about now,
  and batching asks whether two programs were installed in one sitting, which
  is a question about each other.

- **Every stopped colony is one batch, however long ago each stopped.** When a
  colony stopped changes nothing about what to do with it, so splitting the
  expired ones by expiry would reintroduce the volume the batching exists to
  remove. The batch still carries an `expiryMs`, but it points into the past
  and is documented as a fact to display rather than a deadline to schedule
  against. This rules out a caller reading "the next thing due" off any batch
  it happens to find first; the summary strip asks for a `running` batch by
  name.

- **A zero drops both its tone and its glyph.** An amber "0 undercut" sends the
  reader to a page with nothing on it, which is the opposite of what a triage
  board is for — the colour means "look here" and a zero has nothing to look
  at. Dropping the tone alone would not do, because DESIGN.md §7 makes the
  glyph a signal in its own right, so a shape left behind would still say "look
  here" to a reader who cannot see the colour. The severity applies only once
  there is something behind the number. This rules out toning a tile by what it
  _could_ mean rather than by what it currently says.

- **Below-floor keeps its own footer line rather than becoming a fourth tile.**
  It is the one order problem that is losing money now rather than merely
  losing the sale, and folding it into "undercut" would hide it. It is also a
  different _axis_ from the three undercut scopes rather than a fourth scope:
  `orderProblems.ts` derives the scopes from a single `undercutScope` field
  holding the tightest one that beats the order, so an order carries at most
  one — but it can be below floor as well. This rules out subtracting
  below-floor from the undercut count, which would silently remove sell orders
  under cost that nobody had undercut at all.

- **There is no "owed to you" anywhere on this board, and no ISK figure on the
  summary strip.** The Moon Mining Tax ledger is built on the pilot's own
  mining, so it only ever shows what _you_ owe; a reciprocal figure would be
  meaningless. And an unpaid-ISK cell on the strip printed the same number as
  the Mining Tax card's own tile two panels away — one number in two places is
  a number the reader ends up checking against itself. This rules out the strip
  growing a fourth cell for any figure a card already carries.

- **The Notification Feed moves off the Overview to `/alerts`, and gains a rail
  entry.** It rendered in exactly one place, inside `routes/Overview.tsx`, with
  no page and no nav entry of its own — so summarising it into a board column
  would have stranded every alert the column did not list. The column is now
  the summary and the page is the detail, which is the relationship every other
  card already has with its page; alerts were the only domain without one.
  `NOTIFICATION_FALLBACK_ROUTE` and the `eveNotification` event's own route
  both move there too: `/alerts` groups by `eveType`, so a tapped push with no
  page of its own now lands on the list of that exact type rather than on a
  dashboard. This rules out merging the feed into Settings' notification panel,
  which is _preferences_ (what may fire) against the feed's _record_ (what
  did).

- **The Alerts page is device-wide, while the board stays on the active
  Character.** The Foreground Poller runs across every Character on the device,
  so an alt's alerts were previously invisible until you happened to switch to
  it — `feedSelection.otherCharacterAlerts` exists precisely because the old
  panel could only offer them as a count-per-Character footer. On the page they
  are simply in the list, each fire naming the Character it belongs to. This
  rules out the board doing the same: every other card on it is one Character's
  data, and mixing scopes inside one screen is what made the old footer
  necessary.

- **The Alerts page shows muted types, behind a chip, and that is the only
  place un-muting is reachable outside Settings.** `NotificationContextMenu`
  documents its own "hide in feed" as one-way, because the row it was set from
  disappears the instant it applies. Since the page reads the raw feed rather
  than `visibleFeedEntries`, a muted type is listed, marked, and reversible. A
  group counts as muted only when it is muted for _every_ Character it fired
  for — a type silenced on one alt is still live for the others, and dimming
  the whole row would misreport that. This rules out the page reusing
  `visibleFeedEntries`, which would have made the mute permanently one-way.

- **The row's mute is a set, not a toggle.** A type's row spans every Character
  it fired for, and those Characters can disagree — one muted from a context
  menu months ago, the rest not. Looping the existing `toggle*ChannelPref` over
  them would flip each independently and land on the _inverted_ mixed state, so
  `setFeedMutedForCharacters` takes the intended end state and writes only the
  Characters that disagree with it. It is sequential, re-reading the store
  between writes, because `updateNotificationPrefs` takes a whole next value
  and a parallel fan-out would have every write build on the same pre-loop
  snapshot. This rules out inventing a third mute concept: the row writes the
  same per-event and per-`eveType` feed-channel flags Settings and the context
  menu already write, chosen by the same `entryChannelTarget`.

- **The board reuses the Orders page's own loader rather than a cheaper one.**
  "Undercut" is a claim about what a rival is charging, so it needs the station
  book whatever surface asks — there is no cheap version of the question. The
  loader moved to `features/market/openOrdersPageSnapshot.ts` so both consumers
  share one, since two loaders would be two subtly different answers to one
  question on two pages of the same app. The board does skip the per-order
  region and structure book fetches, which the Orders page issues only when a
  row is opened. This rules out an approximate count on the dashboard: a number
  that disagrees with the page it links to is worse than a slower card.

- **Pre-filtered deep links are deferred, not designed out.** The mockups show
  each count opening Orders already narrowed to that problem, but
  `openOrdersFilter.ts` state is component-local — no route expresses it — so
  the tiles link to the unfiltered page and the URL plumbing is left for a
  ticket of its own. This rules out reading the current links as the intended
  end state.

- **Every card renders in every state, including the boring one.** A card that
  disappears when a Character has no colonies cannot be told from a card whose
  read failed, and one gated on its own data disappears mid-load as well. So
  the cards take nullable data and say what they checked — "Checking…", the
  domain's own empty line, or "Log in again to see this." where the loader
  reported `needsReauth`. This rules out conditional rendering as the way to
  handle an absent scope, which is what made an empty board ambiguous in the
  first place.

- **The Contracts tile is dropped.** It counted active contracts, which is a
  figure rather than a thing that needs you, and nothing in the triage question
  this page now answers has an answer that involves it. This rules out keeping
  a tile purely because it was already there; the Contracts page is still in
  the rail.
