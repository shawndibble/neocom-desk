# Scope decisions — Appraisal prices at a Trade Hub and shares the Browser's hub

_Recorded 2026-09-08._

- **The Appraisal tab prices at a Trade Hub only — it has no Region mode.**
  Prices come from Fuzzwork's aggregates, which are keyed by **station**, so a
  hub appraisal is one batched request for the whole paste. A Region appraisal
  would have to go through `getOrderBook`, which is one paginated ESI call
  _per type_ — a forty-line paste would be forty paginated fetches to answer a
  question nobody asked. This rules out the **Location Mode** chips appearing
  on the tab at all: a control that cannot do anything where it is drawn is
  worse than one that is absent (`usesHubPicker` in `routes/Market.tsx`). If
  region-wide appraisal is wanted later it is its own ticket, not a toggle.

- **Appraisal reads and writes the same `sync.marketHub` the Market Browser
  does, rather than keeping a hub of its own.** Which hub you price at is one
  preference, not two: a pilot who trades out of Amarr means it on both tabs,
  and two hubs in one page header — visibly the same control in the same slot
  — that disagreed about which hub you were on would be a bug report. This is
  the opposite call from Moon Mining's Payee hub (`20260907-100006`), and for
  the same reason that one went the other way: the Payee hub is a _term of an
  invoice_ recorded on the Payee, while both of these are viewing preferences
  about how the pilot reads prices. Changing the hub on Appraisal therefore
  changes it on Browser, deliberately.

- **The percentage of market syncs, under its own `sync.marketPricePercent`
  key.** It is the other half of the same control pair as the hub, and answers
  the same kind of question — "I value loot at 90% of Jita" is a fact about
  how the pilot trades, not about the machine they opened. One of the pair
  travelling between devices while the other did not would be a difference
  with nothing behind it. Its own key rather than a blob shared with the hub,
  so the two merge independently (`sync/syncedSettings.ts`).

- **The percentage multiplies both sides of the book, not one.** The tab
  reports buy and sell together, so scaling only one would make the spread
  between them meaningless. A buyer quoting loot at 90% and a seller checking
  what a haul fetches read the same two columns and apply the percentage the
  same way; which column matters is theirs to choose, and the app does not
  guess. This rules out a "side" control for now.

- **The pasted list lives at route level (`useAppraisal`), not inside the
  panel.** `Market.tsx` renders the panel behind `section === 'appraisal'`, so
  holding the text in the component would throw away a long paste the moment
  someone glanced at the Browser tab. It also lets the page header's shared
  refresh button re-price the list, which is what that button means on this
  tab.

- **Unmatched lines are reported, never silently dropped.** A paste that names
  something the market catalogue does not hold — a typo, a non-tradeable item
  — is listed by source line beside the paste box, because a total that
  quietly omits rows is a wrong answer presented as a right one. Same reason
  a side with no orders shows a dash and is left out of that total rather than
  being summed as zero (`engine/market/appraisal.ts`).
