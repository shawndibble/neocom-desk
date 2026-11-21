# Scope decisions — Page hubs override the Global hub per page area

_Recorded 2026-11-20. Issue #6523._

- **A page area can price at a Trade Hub of its own (a Page hub) instead of
  the Global hub.** The Global hub is unchanged (`useMarketHub`: the active
  Character's hub, else the account default). Page hubs are one account-wide
  synced map, `sync.pageHubs`, `area -> hub id`, over twelve player-named areas
  (Market, Appraisal, Ship Fit Costs, Skills, Contracts, Industry, LP Store,
  Planetary Industry, Mining, Assets, Corp SRP, Overview). A finer list would
  be some forty entries nobody sets. They are account-wide, not per Character:
  Closest hub covers "this Character lives elsewhere".
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
- **An entry this build cannot read leaves that page on Global,** so a newer
  build's entry (Closest, a new area) never fails an older one (slice 4 made
  the map keep such entries rather than drop them). Closest is therefore a page
  entry value, never a value written into `sync.marketHub`, where an older
  client would read it as Jita.
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
    before page hubs, the latest plan's hub, else the Global hub (Jita before). That keeps "no entries, nothing
    moves".
  - Each Build Plan keeps its own hub.
  - **LP Store** covers its offers and landing. The header gear is a `HubField`. The filter box
    keeps its hub `Select`, because the box applies its drafts together on Apply. An Applied hub
    writes through `pickHubFor('lpStore', …)`.
  - **Corp SRP** covers Doctrine coverage.
- **Market and Appraisal join (slice 4). This supersedes `20260923-174003`'s device-local
  Market Browser hub.** It was device-local so browsing a hub on a phone never moved every other
  page's hub. A Market entry gives the same separation, and it syncs (the owner agreed).
  - **Migration:** on a device's first Market visit, its old `marketBrowserHub` becomes the Market
    and Appraisal entries, where those have none yet, after the first sync pull, so the map it
    writes back holds other devices' entries. The device row is kept, so an older build on that
    device still reads it, and a local marker records the fold. A device that never opened the
    Market starts on Global, which is what it seeded from before.
  - **The stored map keeps every entry, even one this build cannot read** (`parsePageHubs`,
    `ownChoice`). A newer build's area or value survives an older build's edit, which writes the map
    back whole.
  - **Market** covers the Browser, an item's Market section (`useSavedOrderBookLocation`), the
    Stock tab, the Compare drawer's own-hub mark, and price alerts: the form, the poller and the
    Overview card. A good price sends the pilot to the market to buy.
  - **Links:** a Market link naming a hub (`?hub=`) is adopted as the Market's own entry
    (`setPageHubEntry`), never the Global hub, and only once per new link. Opening someone's link
    moves no other page, and switching the Market back to Global sticks.
  - **Appraisal links:** on the Appraisal tab, `?hub=` (a Shared Appraisal's "Open Neocom Desk")
    prices that visit only, as `?percent=` does.
  - **Appraisal** prices at its own hub, apart from the Browser's. Its picker writes that hub, not
    the URL. The Fittings export's Minus owned station falls back to it.
  - **Hauling** keeps its From/To. The default pair still comes from the Global hub.
- **Planetary Industry, Mining, Assets and Overview join (slice 5).**
  - **PI**'s sell market is a `HubField` with My corp buyback as an option after the hubs
    (`HubMenu`'s `extraOptions`). The buyback, buy tiers and the nudge's "chosen" flag stay in the
    device-local `piSettings`. A hub picked there before (`hubChosen`) seeds PI's entry once per
    device; a never-picked default leaves PI on Global. Each pick is also written to
    `piSettings.hub`, which older builds read. The nearest-hub nudge gives PI its own entry: it is a
    fact about the colonies, so it never moves Global.
  - **Mining** covers the Survey and its Overview widget. The Survey's device-local hub
    (`miningSurveyPriceHub`) seeds the entry once, the way the Market Browser's did. A Survey that
    never had a hub picked now prices at Global, not Jita. **Mining Yield stays on Jita**: its
    mined-date prices come from a snapshot published for Jita only, and live prices at another hub
    would mix two hubs in one figure.
  - **Assets** covers Move plan cargo value (Jita before) and the ore decision.
  - **Overview** covers a Market Trend widget with no hubs of its own. Price alerts on the board
    stay Market's.
  - The `seedPageHubsOnce` helper (`pageHubSeed.ts`) owns every one-time fold: kept old row,
    local marker, wait for the first pull.
- **Closest hub (slice 6).** Closest is the hub fewest jumps from the active Character's Current
  System (game location or a hand pick) by the saved route preference, worked out only while
  something is set to it and kept per Character for five minutes.
  - **A page entry stores `'closest'`;** older builds read it as Global, and the passthrough map keeps
    it.
  - **Global's Closest is its own synced boolean, `sync.marketHubClosest`,** never a value in
    `sync.marketHub`, so an older build always reads a real hub. That stored hub (or the
    Character's own) is the fallback with no location. A hub pick on Global clears the flag.
  - A page switched to its own hub while Global is Closest starts on Closest.
  - A Build Plan stores the hub Closest found when the plan was made; plans keep their own hub.
  - Settings' Trade Hub select and each Page hub row offer Closest hub; the per-Character selects do
    not (the flag is account-wide).
  - **Global's Closest is account-wide and wins over a Character's own hub** while it finds one;
    the Character's hub is then the fallback with no location.
  - **The LP Store filter box offers hubs only.** Its draft is applied with the other filters, so
    Closest is picked from the gear's `HubField` instead.
  - **Settings shows "Closest hub" without the hub it found:** Settings is not where the pilot
    is priced; each page's own picker shows "Closest (Amarr)".
- **Two Jita prices stay Jita, outside the areas:** Pilot Lookup's loss values (another pilot's
  losses, valued as killboards value them) and the hauling fee estimates.
