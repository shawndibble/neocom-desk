# Scope decisions — market browser filter bar remembers device default

_Recorded 2026-09-27._

- **The Order Book filter bar (Jump Range, Security, Min quantity, NPC
  stations only) is now `useRememberedUrlParams`, not plain `useUrlParams`.**
  Each field's device-local default lives in `useBrowserFilterSetting`
  (`src/features/market/browserFilterSetting.ts`, Dexie key
  `marketBrowserFilters`) and is written whenever the reader edits that
  field — same pattern as Location Mode/Trade Hub in `useMarketBrowser.ts`.
  The URL still states the live value and still wins for a shared link; a
  fresh visit or a reload with no matching query param now reads the
  reader's last choice instead of the codec default. Rules out treating this
  filter bar as URL-only going forward — a future field added to
  `BROWSER_FILTER_PARAMS` should default to being remembered the same way
  unless there's a specific reason not to.
- **The order book's fetch effect gates on `browserFilterSettingHydrated`
  too, alongside `hubHydrated`/`locationModeHydrated`.** Without it, All
  Regions with a persisted (non-default) Jump Range would fire once against
  every Market Region on the pre-hydration default before the stored Jump
  Range resolves, then again against the narrowed in-range set — a slow,
  wasted full fan-out on every visit, which is exactly the “All regions +
  15 jumps is slow” complaint this change exists to fix. Rules out adding a
  remembered device default to a value that feeds `allRegionsFetchKey`
  without also adding it to this gate.
- **The Current System pick's self-clear-on-movement behavior (CONTEXT.md's
  “Current System” glossary entry, `effectiveCurrentSystem` in
  `src/engine/route/jumpRange.ts`) is unchanged.** It already persists a
  picked system per-Character across reloads and already tracks the active
  Character's ESI location dynamically once the pick is cleared — both were
  true before this change. Only the Jump Range _value_
  (`any`/`system`/3/5/10/15/20) and the other filter-bar fields lacked a
  remembered device default; the “pick a location and it should keep it, or
  use game location and it should track it” half of the ask was already
  correct.
