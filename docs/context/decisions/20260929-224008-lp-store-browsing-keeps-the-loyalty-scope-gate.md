# Scope decisions — LP Store browsing keeps the loyalty scope gate (issue #2321)

_Recorded 2026-09-29 · issue #2321._

- **Browsing any LP Store stays gated on `getCharacterLoyaltyPoints`, on both
  `/wallet/loyalty` (the picker's landing state) and
  `/wallet/loyalty/:corporationId`.** The picker opens every NPC corporation's
  store, including ones the Character holds no LP with — no LP is a balance
  of 0, which the store already handles, not a missing grant. The loyalty
  scope is in the Base Grant, so the gate only ever stops a Core-only or
  stale-token Character, and for them the page's point — affordability and
  the picker's pinned held-LP corps — would be silently wrong rather than
  absent. The alternative (ungated, balances shown only when granted) would
  also run the page's other personal reads (standings, owned assets, skills)
  for a Character who never granted them. Rules out: an ungated "anonymous
  browse" mode for the LP Store.
