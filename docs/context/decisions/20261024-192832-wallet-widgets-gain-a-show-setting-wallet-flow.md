# Scope decisions — Wallet widgets gain a Show setting; Wallet flow, Cash flow and Income by source fold in

_Recorded 2026-10-24._

- **One kind per wallet feed, a Show setting for the question.** The Wallet
  shows Balance (default) or Flow; the Corp wallet shows Divisions (default),
  Flow or Sources. Wallet flow, Cash flow and Income by source were separate
  kinds over the same feed, which split the money widgets differently on the
  two boards. The Show is one shared setting (`show`, options per kind in
  `kinds.ts`), not a flag per kind, so a later kind with the same shape reuses
  it. Rules out re-adding a kind that only re-reads another kind's feed.
- **Structures' Show is the same setting.** Its All structures / Problems only
  (decision `20261024-192102`) moves onto the shared `show` field; the
  `structuresShow` it was briefly stored under reads as `show` on load.
  Profit's Source stays its own setting: it changes what is read and which
  Characters can sum, not only what is drawn.
- **On the wallet kinds a Show other than the default names the widget**
  (Wallet flow, Cash flow, Income by source; Structures keeps its name), so three corp wallets on one board stay tellable apart
  without a stored title.
- **The old names stay findable** as Gallery presets that add the merged kind
  on that Show, opened at the view and size the old kind opened at. The Market
  Trend preset list was generalised to any kind for this (`galleryPresets.ts`).
- **Range follows the Show.** Divisions are balances as of now, so the Corp
  wallet offers Range only on Flow and Sources; switching Show keeps the view
  and range, since every Show offers all three views.
- **Saved layouts fold in on read.** `walletFlow` reads as the Wallet on Flow,
  `corpCashFlow` and `corpIncome` as the Corp wallet on Flow and Sources, with
  place, size, view, range and title kept. An older build reading a migrated
  layout keeps the unknown `show` field and draws the default Show.
