# Scope decisions — A Character opens Assets, Wallet Journal and Open orders by ?char=<id> (issue #2936)

_Recorded 2026-10-08 · issue #2936._

- **The shared Character parameter is `?char=<id>`; Assets' `?chars=<id>` is its alias.** `?character=` was already taken: an alert's link uses it to _switch_ the active Character, which is the opposite of this. Only a single numeric id names a Character; `current`/`all` (and id lists) stay the Character filter on Assets and Wallet Balance, and stand down while a Character is named. An id that is not one of the account's Characters is ignored. The active Character is never changed.
- **The origin crumb rides in route state, not the URL.** `{ origin: 'wallet' }` in `location.state` shows a "‹ Wallet" link; a plain visit or a shared URL shows none.
- **A named Character's missing scope shows that Character's grant note.** Assets' route gate (`ScopeGate`) stands down for it, since it judges the active Character's grant.
