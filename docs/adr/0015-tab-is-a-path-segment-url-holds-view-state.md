# 0015 — A tab is a path segment; the URL holds short-lived view state

## Status

Accepted (2026-09-22)

## Context

Issue #1299. Tabs and filters lived in component state, so a reload — or a
link pasted to another pilot — reopened every page on its first tab with every
filter cleared. Industry › BPC Sourcing searched for "Inferno Cruise Missile
Blueprint" came back empty on reload. A few pages had grown ad-hoc
`?tab=` params (`/bpc-contracts` redirects to `/industry?tab=sourcing`) and
Market Browser had its own query parsing (`engine/market/urlState.ts`), but
there was no one mechanism.

Routing constraints that shaped the answer:

- `App.tsx`'s `ROUTE_ELEMENTS`, `routeScopes.ts`'s `ROUTE_REQUIREMENTS`,
  `pagePathFor` and `routeWarm` are keyed by route path. A literal entry per
  tab in each would multiply four tables by every tab in the app.
- `Layout` deliberately keeps one outlet instance across pathnames of one
  match (no `key={pathname}`), and fades the outlet on pathname change. A tab
  switch must not remount the page (losing its state and re-running its
  loader) and should not fade as if it were a new page.

## Decision

**A tab is a path segment.** `/contacts/character`, `/contacts/across`. A
tabbed page declares its tabs once (`lib/pageTabs.ts`'s `definePageTabs`: id =
path segment, plus label key) and registers them in `app/pageTabs.ts`'s
`PAGE_TABS`. That registration is the whole routing change:

- `App.tsx` mounts the page at `<path>/*` — one route, so switching tabs keeps
  the page mounted. The route tables keep their single `<path>` entry;
  `ScopeGate` gates on it.
- `TabRoute` replaces the bare path or an unknown segment with the default
  tab (a history _replace_, keeping query and hash).
- `usePageTab` reads the tab from the path; a switch is a history _push_, so
  Back returns to the previous tab.
- `Layout`'s fade keys on `pageKeyFor(pathname)`, which collapses a declared
  tab to its page: no fade between tabs.
- `pagePathFor` reports each declared tab as its own analytics path — a
  closed set, unlike an id.

**The query string holds short-lived view state**: search text, filter
chips, a table's sort. `lib/urlState.ts` has typed codecs (text, int, bool,
enum, enum set, id list, sort; `features/character/characterFilterUrlParam`
for `CharacterFilterValue`) and `lib/useUrlState.ts` the hooks
(`useUrlParams`, `useUrlParam`, `useUrlSort`). Rules:

- Defaults are omitted from the URL; unreadable values parse to the default.
- Writes _replace_ history; text is debounced, and a click in the same group
  flushes pending text with it in one navigation.
- Keys are scoped per panel/table (`across.sort`) and a page's keys that
  change together are one `useUrlParams` group.
- `DataTable` takes an optional controlled `sort`/`onSortChange`; tables that
  pass neither are unchanged.

Market Browser's keys (`type`/`hub`/`region`/`group`) keep their meaning;
`lib/urlState` reuses its `parsePositiveInt`. One-shot params
(`?highlight=`, `?product=`, `?material=`) stay one-shot — spent on arrival,
not view state.

## Consequences

- Old tab links break: the bare page path redirects to the default tab, and
  old `?tab=` params are not mapped. Accepted by the owner.
- Persisted preferences stay out of the URL; the URL only overrides them for
  that view (scope decision "persisted view preferences stay out of the URL").
- Modals, their inner tabs, and detail/inspector selections stay out of the
  URL.
- Each remaining page converts in its own ticket, following
  `docs/ARCHITECTURE.md` §9.
