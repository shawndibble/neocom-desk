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
- **One synced map, not a key per area.** Whole-value last write wins, so two
  devices editing different areas inside one sync window keep only the later
  map; accepted for a setting edited this rarely, the same trade
  `sync.marketHubByCharacter` makes.
- **This slice moves Contracts only.** Contract Search (its Item Search flags
  and Below market), own contract and public contract panels read
  `useHubFor('contracts')`, so a row and the panel it opens price at one hub. The other areas keep
  reading the Global hub until their own slice moves their readers and pickers
  onto `useHubFor` and `HubMenu`, and adds the area to `PAGE_HUB_AREAS`. Only
  listed areas are offered in Settings or kept on parse, so no entry is ever
  offered that does nothing.
- **Ship Fit Costs (`fittings`) and Skills (`skills`) join (slice 2).** Ship
  Fit Costs covers every Fittings price: the Price section, fit Appraisal,
  Implant Finder, Improve, Make it fit, charges, hull rows, the Abyssal
  planner, module variations, and the `/ships` compare. The last two always
  priced at Jita; they now follow the area. Skills covers skill book prices,
  Skills to Buy, the injector facts and the Characters page's SP extraction
  value, which is an injector price. A field-chrome `HubField` (the
  `HubMenu` behind a select-shaped trigger) replaces the hub `Select` on
  both pages. The Fittings export's "minus owned" station still falls back
  to the Global hub on purpose: it is the station the Appraisal tab's Minus
  owned uses, so it moves with the Appraisal area, not with Ship Fit Costs.
- **Industry, LP Store and Corp SRP join (slice 3).**
  - **Industry** covers BPC Sourcing, whose settings hub becomes a `HubField`, and the hub a new
    plan starts at (`newPlanHubId`, used by new plans, Opportunities and Retarget Group).
  - A new plan starts at the Industry entry when there is one. Otherwise it keeps the rule from
    before page hubs, the latest plan's hub, else the default. That keeps "no entries, nothing
    moves".
  - Each Build Plan keeps its own hub.
  - **LP Store** covers its offers and landing. The header gear is a `HubField`. The filter box
    keeps its hub `Select`, because the box applies its drafts together on Apply. An Applied hub
    writes through `pickHubFor('lpStore', …)`.
  - **Corp SRP** covers Doctrine coverage.
