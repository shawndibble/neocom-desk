# Scope decisions — LP Store under Market, Pilot Lookup its own page, Help leaves Settings

_Recorded 2026-10-02._

Each move puts a view under a name a pilot would guess (NN/g's information
scent). Old links redirect, so no bookmark breaks.

- **LP Store moves from Wallet to Market: `/market/lp-store(/:corporationId)`.**
  Shopping an LP store is a market errand. LP _balances_ stay on Wallet ›
  Balance, and each balance row links to that corporation's store under Market.
  The store keeps its own route and its own scope gate (a nested route, not a
  `MARKET_TABS` entry, which would inherit Market's gate) — the reason
  `20260902-101732` kept Clones a route of its own. `/wallet/loyalty(/:id)`
  redirects.
- **Pilot Lookup becomes its own page, `/pilot-lookup`, in the Intel group.** It
  was a Travel tab nobody would look for under “Travel”, and the Intel heading
  sat over one item. Travel keeps Route Safety and Thera & Turnur.
  `/travel/pilot` and `/travel?pilot=<id>` redirect, query intact.
- **Help & FAQ leaves Settings for its own footer page, `/help`** (tabs FAQ and
  Support). Help is not a setting. `/settings/faq` and `/settings/help`
  redirect.
