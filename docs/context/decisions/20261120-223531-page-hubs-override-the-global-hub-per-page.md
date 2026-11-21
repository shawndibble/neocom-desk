# Scope decisions — Page hubs override the Global hub per page area

_Recorded 2026-11-20. Issue #6523._

- **A page area can price at a Trade Hub of its own (a Page hub) instead of
  the Global hub.** The Global hub is unchanged (`useMarketHub`: the active
  Character's hub, else the account default). Page hubs are one account-wide
  synced map, `sync.pageHubs`, `area -> hub id`, over twelve player-named areas
  (Market, Appraisal, Ship Fit Costs, Skills, Contracts, Industry, LP Store,
  Planetary Industry, Mining, Assets, Corp SRP, Overview). A finer list would
  be some forty entries nobody sets. They are account-wide, not per Character:
  Closest hub (a later slice) covers "this Character lives elsewhere".
- **Whether an entry exists is the whole state.** There is no "use the page's
  hub" flag. Switching a page's hub menu to the page creates the entry at the
  hub it uses now, so nothing re-prices. Switching to Global, or Remove in
  Settings (with Undo), drops it. With an empty map every page prices exactly
  as before.
- **One hub picker, `HubMenu`.** A radio group **Global · <page>**, then the
  hubs. A hub pick writes the page's entry when it has one, else the Global
  hub, which moves every page without an entry. This supersedes
  `20261120-212245`'s rule that the contract price check's hub always writes
  the pilot's hub: it now does so only while Contracts is on Global. That
  decision ruled out a panel-only override because two hub settings that
  disagree is what #5593 untangled. Here they cannot disagree: a page either
  has an entry or reads Global, and the menu always says which.
- **An unknown area or hub in the map is dropped entry by entry,** so a newer
  build's entry (Closest, a new area) puts that page back on Global on an
  older build instead of failing. Closest will therefore be a value an older
  client drops to Global, never a value written into `sync.marketHub`, where
  an older client would read it as Jita.
- **This slice moves Contracts only.** Contract Search, own contract and
  public contract panels read `useHubFor('contracts')`. The other areas keep
  reading the Global hub until their own slice moves their readers and pickers
  onto `useHubFor` and `HubMenu`, and adds the area to `PAGE_HUB_AREAS`. Only
  listed areas are offered in Settings or kept on parse, so no entry is ever
  offered that does nothing.
