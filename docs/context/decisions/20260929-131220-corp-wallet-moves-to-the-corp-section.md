# Scope decisions — Corp wallet moves to the Corp section

_Recorded 2026-09-29._

- **Wallet shows only the pilot's own ISK.** Its Personal / Corporation
  `OwnerSwitch` is gone: `/wallet` is the active Character's balance and
  journal, or every Character's balances when the character filter asks for
  it (`?char=`), and nothing corporate. A pilot holding a corp wallet role no
  longer gets a second owner on a page named for their own money. Same move
  Industry made for corp jobs in
  `20260912-131802-corp-industry-jobs-live-only-on-the-corporation.md`; with
  Wallet gone, nothing uses `OwnerSwitch` or `useCorpOwner`, and both are
  deleted.
- **The corporation's wallet is `/corp/wallet`, a Corp sub-nav entry.** Gated
  like `/corp/members`: `useCorpRouteGate` with `canReadWallet`, and the
  `CorpSubNav` entry is hidden (not locked) for a Character without it.
- **One level of tabs, so the page has none of its own.** The Corp sub-nav is
  the tab bar; a second tab bar under it is ruled out app-wide. The page is a
  strip of every division's balance — each a button that selects the division
  — above one table, switched between Journal (default) and Transactions by a
  `SegmentedControl` (`?view=`). That replaces the old Balance tab and the
  division dropdown: the Balance tab showed one number, and the strip shows
  all seven while doing the picker's job. Both reads load for the selected
  division in either view (the journal names its market lines' items from the
  fills), so switching the view never re-pages.
- **Supersedes round 38's Wallet bullets** in
  `20260903-154003-the-personal-corporation-switch.md` ("The switch adds a data
  source and a control", "No capability, no control", "Wallet's Transactions
  tab is personal-only"). The rest of that decision still holds on the new
  page: corp reads are fetched only when the page asks for them, a 403 on a corp
  endpoint is the in-game role gate and never a re-login prompt, and the corp
  journal caches per division. Both journals still share one table component
  and one column-visibility setting (`features/character/WalletJournalTable.tsx`).
- **Old links still land.** `/wallet[/<tab>]?owner=corporation&division=N` —
  the vitals rail's old href, and any bookmark of the Corporation side —
  redirects to `/corp/wallet?division=N` (the old corp Transactions tab adds
  `view=transactions`). `/wallet/transactions` still redirects to Market ›
  History › Transactions.
- **The threshold alert opens the division that tripped it**
  (`/corp/wallet?division=N`).
