# Command palette ("Go to")

Global modal launcher: one search box over grouped results to jump to a page or tab, run a command, switch Character, find an owned asset, open an item or an LP Store, or open a contact. Not a page; no route. Mounted once in `Layout` for every authenticated route. User goal: get anywhere in the app from the keyboard (or one tap) without learning the nav. It is explicitly not a page filter: a page's own search box filters that page, the palette goes elsewhere (footer note `commandPalette.scopeNote`).

Code: `src/features/commandPalette/` (`CommandPaletteHost.tsx`, `CommandPalette.tsx`, `store.ts`, `types.ts`, `usePaletteSearch.ts`, `providers.ts`, `assetsProvider.ts`, `marketItems.ts`, `lpStoresProvider.ts`, `contactsProvider.ts`), nav descriptor `src/app/navDestinations.ts`, chord helpers `src/lib/shortcuts.ts`, ranking `src/lib/rankedSearch.ts`, openers `src/app/RailNav.tsx:47`, `src/app/MobileMoreSheet.tsx:106`.

## Summary

| Feature                   | What                                                                                 | Where                                                               |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Open: chord               | Ctrl+K (Windows/Linux) / Cmd+K (Apple), also from inside text fields; again to close | `CommandPaletteHost.tsx`, `shortcuts.ts` `isCommandPaletteShortcut` |
| Open: desktop button      | "Go to..." button top of the rail, shows the chord                                   | `RailNav.tsx:47`                                                    |
| Open: phone               | Search field at top of the More sheet (closes sheet first)                           | `MobileMoreSheet.tsx:106,153`                                       |
| Groups (fixed order)      | Pages, Commands, Characters, Assets, Market items, LP Stores, Contacts               | `CommandPalette.tsx` `useShippedProviders`                          |
| Keyboard                  | ArrowUp/Down, Home, End, Enter, Escape; focus stays in input                         | `CommandPalette.tsx` `handleKeyDown`                                |
| Pointer                   | Click a row to activate; mouse-down does not steal focus                             | same                                                                |
| Locked pages              | Marked with amber dot + sr-only text, still navigate                                 | `result.locked`                                                     |
| Loading / error per group | "Searching..." row; "Couldn't load these results" in that group only                 | `usePaletteSearch.ts`                                               |
| Result count (a11y)       | polite live region                                                                   | `CommandPalette.tsx`                                                |

## Opening and closing

- Chord: `isModChord(event, apple, 'k')` - exactly one modifier per platform (Cmd on Apple, Ctrl elsewhere), Alt and Shift disqualify (`shortcuts.ts`). `preventDefault` stops the browser's own Ctrl+K. Listener is always attached (not part of the single-key shortcut table, so unaffected by WCAG 2.1.4 considerations) and fires from inside inputs.
- Toggle: pressing again closes. It will not open on top of another open `<dialog>` (`document.querySelector('dialog[open]')`) so two modals never stack; if the palette itself is open it closes.
- Rendered only while open (`open && <CommandPalette>`): every opening starts with an empty query and the first result highlighted; live reads cost nothing when closed. Signing out hides it so the next shell is not pre-opened.
- Escape closes (handled in the input's key handler because a search input would otherwise spend Escape clearing text). Activating a result closes first, then runs, so the dialog hands focus back before the navigation's own focus lands.
- Shortcut listed in Help > Shortcuts (`ShortcutsPanel.tsx`, row "Open the command palette"). History: decision `20260929-235256-command-palette-opens-by-shortcut-only` (no visible trigger) was superseded by `20261002-145653-go-to-button-opens-the-command-palette` (rail button + More-sheet search field, since a hidden chord is undiscoverable and phones have no keyboard).

## Search model

- `usePaletteSearch(providers, query)`: trims the query, sorts providers by `order`, skips those whose `minQueryLength` exceeds the trimmed length, asks each provider during render (memoised on providers + query). Sync answer renders immediately; Promise answer shows that group as `loading` until it settles; rejection shows an error row in that group only; stale answers for an old query are dropped and their `AbortSignal` aborted. Empty groups are hidden. No debounce (all providers are in-memory).
- Highlight is one index across groups, tracked by `groupId:resultId`, so an async group landing above does not move it; new query resets to the top, so Enter takes the best match. Home/End/arrows wrap via `moveHighlight`.
- Ranking (`rankedSearch.ts`): case-insensitive; exact name > prefix > substring > secondary-field-only match; alphabetical within rank; empty query returns nothing. Per group cap `GROUP_LIMIT = 6` rows.
- ARIA: hand-built combobox (input `role=combobox`, `aria-activedescendant`), one `role=group` per provider labelled by heading, results `role=option`. "Nothing matches." when query non-empty and no group has rows.

## Groups

| Order | Group        | Min chars | Matches                                                                 | On select                                                | Source                                                              |
| ----- | ------------ | --------- | ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| 0     | Pages        | 0         | label (primary), breadcrumb and translated keywords (secondary)         | `navigate(path)`                                         | `listNavDestinations`                                               |
| 1     | Commands     | 1         | label                                                                   | run command                                              | `PALETTE_COMMANDS`                                                  |
| 2     | Characters   | 1         | Character name; "Active" hint on the current one                        | `setActiveCharacter(id)`                                 | Dexie `characters` live query                                       |
| 3     | Assets       | 2         | item name; sublabel "Char xN" per holder, hint total "xN"               | navigate `/assets?q=<name>[&chars=all]`                  | cached assets of all Characters whose token has the assets scope    |
| 4     | Market items | 3         | name: exact, prefix, substring (own scan, alphabetical per rank)        | Item Detail modal over current page (`showOpenInMarket`) | SDE market catalogue (~19.5k types, lazy ~1.5 MB, outside precache) |
| 5     | LP Stores    | 2         | NPC corp name; hint "N LP" for corps the active Character holds LP with | navigate `/market/lp-store/<corpId>`                     | SDE `loadLpCorporations` + cached loyalty balances                  |
| 6     | Contacts     | 1         | contact name; sublabel type + "+standing Character" per holder          | open Public Info modal                                   | cached contacts across Characters whose token has contacts scope    |

- Pages: empty query lists pages only (kind `page`), uncapped, as a quick navigator; with a query, tabs and sub-views are included, capped to 6 (`providers.ts:34-53`). Corp pages are listed only while the Corp entry is visible (hidden, never locked); other scope-gated pages are marked locked, never hidden. Contacts is `tablessNav` so its views are not listed separately (no `/contacts/across` entry).
- Commands (`PALETTE_COMMANDS`, `providers.ts:70-95`): Open settings (`/settings`), Keyboard shortcuts (`/help/shortcuts`), Add character (`beginAddCharacterLogin()`), Open notification feed (`/alerts`).
- Assets href (`assetsHref`): `chars=all` added when any holder is not the active Character, so an alt-only item never opens an empty search. A type with no cached name is dropped. Scope check uses `requiredScopesForEndpoints(['getCharacterAssets'])` against `db.tokens.scopes`; a Character without it contributes nothing; with no grant anywhere the group never shows. No request is ever made.
- Contacts: cache-only; names read from the name cache (`readCachedNames`), unresolved names are dropped, factions dropped (no Public Info). Open goes through `openPublicInfoModal` (URL-backed `?info=`).
- Market items: while the catalogue is cold the group returns a Promise (loading row); `marketItemCatalogue.load({retry:true})` starts at palette open, one retry per opening after a failure; failure shows only inside this group.
- LP Stores: corporation list and balances are fetched lazily on first qualifying search, then answered synchronously; missing balance only loses the hint.

## Persistence and permissions

Nothing persisted: query and highlight are component state; no recents, no history. Open state is a zustand store (`store.ts`). ESI: none directly; groups read Dexie caches (assets, contacts, names, loyalty) and the SDE snapshot. Scope handling: assets and contacts groups need their scope on the Character's token; pages are marked locked via `useLockedRoutes(NAV_LOCK_PATHS)`.

## Test-covered behaviours (`CommandPalette.test.tsx`, `providers.test.ts`, `usePaletteSearch.test.tsx`, provider tests)

Ctrl+K from a text field (:120), no stacking over dialogs (:137), empty query lists pages (:152), "opp" finds Industry > Opportunities (:161), history replace on navigate (:177), fixed group order and cross-group arrows (:199), locked page marked but navigable (:223), Character switch (:233), catalogue load on open (:243), catalogue failure scoped to its group (:268), Item Detail focus return (:290), Add character (:310), contacts never fetch and need scope (:350, :365), LP store open and balance hint (:381, :393), LP list loading does not block typing (:412).

## Interview Q&A

1. **Why is the palette rendered only while open?** So every open starts clean and the live Dexie queries (characters, contacts, assets) and corp-access reads cost nothing otherwise (`CommandPaletteHost.tsx` comment).
2. **How does Enter pick a result and why is it stable under async groups?** Highlight tracks a `provider:id` key; a new query clears it so index 0 (best match, groups ordered 0-6) is used; late groups cannot shift it (`CommandPalette.tsx` `highlightedKey`).
3. **Why can Pages show everything on an empty query but other groups show nothing?** `createPagesProvider` returns all `page` destinations on an empty query as a navigator; `rankedSearch` returns `[]` for empty and other providers have `minQueryLength >= 1` (`providers.ts:36-41`).
4. **Why do thresholds differ per group (1/2/3 chars)?** Market items would match half the catalogue under 3 chars (same threshold as the Market Browser tree search, `marketItems.ts` constant); assets/LP at 2; people/commands at 1.
5. **How does it avoid costing ESI calls?** Assets/contacts/LP balances are read from Dexie only; names from cache; no ESI request on typing or open (`assetsProvider.ts`, `contactsProvider.ts` file comments).
6. **What does a locked page do?** Still navigates so `ScopeGate` can explain; the row gets an amber dot and sr-only "locked" text (`result.locked`, `navDestinations.ts` `listNavDestinations`).
7. **Why does it refuse to open over a dialog?** Two stacked modals would leave Escape closing the palette back onto a forgotten dialog (`CommandPaletteHost.tsx`).
8. **Why was the on-screen opener added after the shortcut-only decision?** Discoverability and phones without keyboards; it says "Go to" with a caret, not "Search" with a magnifier, to avoid reading as a page filter (decision `20261002-145653`).
9. **What happens when a provider rejects?** Only its group shows `groupError`; others render; the status region appends the error (`usePaletteSearch.ts`, `CommandPalette.tsx`).
10. **How are market item results ranked without `rankedSearch`?** A pre-lowercased, pre-sorted index scanned linearly: exact, prefix, substring, early-exit when limits are filled; measured 0.1-0.8 ms/keystroke vs ~1.5 ms (`marketItems.ts` header).
11. **What does selecting an asset do for an alt-only item?** Navigates to `/assets?q=<name>&chars=all` so the page searches across Characters (`assetsHref`).

## Observed gaps

- No recent items. Settings sections and Help tabs are listed as tabs (`SETTINGS_TABS`, Help tabs; Settings sections hidden-from-tab-bar only at `md+`, still palette-listed), but individual settings (e.g. Week starts on) are not searchable.
- No palette entry for the Contacts All-characters view (tablessNav) or for Alerts filters/mute.
- Characters, commands and contacts groups need >= 1 char; group results capped at 6 with no "show more".
- Assets/contacts groups are only as fresh as the caches; a never-opened alt contributes nothing, with no hint that it is missing.
- Only four commands; none for refresh, theme, log out or export.
- Contact and asset sublabels are built with `toLocaleString` and English-only i18n strings.
- No on-screen opener on phone outside the More sheet (decision accepted).

## Improvement ideas

- Recently used destinations on an empty query; pin favourites.
- Prefix operators (`>` commands only, `@` characters) and per-group "see all N".
- Surface stale-cache warnings per group; allow "include uncached characters" action.
- More commands: switch time zone, toggle compact mode, refresh page, log out.
- Result for System/Route Safety lookups and Public Info search (character/corp by name via ESI search).
