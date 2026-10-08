# Wallet — feature inventory

Route `/wallet` (`src/routes/Wallet.tsx`). Economy nav group, mobile tab. Tabbed page: `WALLET_TABS` (`src/app/pageTabs.ts:90-94`). Read-only, cached for offline (Dexie). Terms per `CONTEXT.md`: **Character**, **Data Age**, **EverMarks**, **Loyalty Points**.

## Summary

| Feature                                  | Where                                 | Notes                                                                                                           |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Balance tab (`/wallet/balance`, default) | `Wallet.tsx:560-757`                  | ISK balance, EverMarks, balance-history chart, LP-per-corp table                                                |
| Journal tab (`/wallet/journal`)          | `Wallet.tsx:759-816`                  | filterable/sortable/virtualized ledger, column picker, export                                                   |
| `transactions` alias tab                 | `pageTabs.ts:90-94`, `Wallet.tsx:522` | not a tab; redirects to `/market/history/transactions`                                                          |
| Cross-character balance (`?char=`)       | `Wallet.tsx:570`                      | per-Character table + total, picker, CSV/XLSX/clipboard export                                                  |
| Balance-history chart                    | `WalletBalanceChart.tsx`              | lazy Recharts line from journal `balance` field                                                                 |
| Loyalty Points table                     | `Wallet.tsx:707-756`                  | per-corp LP, row → LP Store, export, LP Store picker                                                            |
| LP Store picker                          | `features/loyalty/LpStorePicker.tsx`  | select-box over every NPC corp with an LP Store                                                                 |
| Journal filters                          | `WalletJournalTable.tsx`              | ref type, date range, free text; filtered count + net total; ref-type breakdown (in/out/net, row click filters) |
| Journal column picker                    | `walletJournalColumns.ts`             | date/description/amount/balance toggle; device-local                                                            |
| Journal row enrichments                  | `JournalDescriptionCell.tsx`          | bounty factions, daily-goal names, contract link, mining-tax link, market item                                  |
| Wallet-alert deep link                   | `Wallet.tsx:185`                      | `walletBalanceChanged` → `/wallet/journal?highlight=<id>` pulses the row                                        |
| Exports                                  | `useTableExport` + `TableActionsMenu` | 3 surfaces: `wallet-journal`, `wallet-balances`, `loyalty-points`                                               |
| Refresh                                  | `Wallet.tsx:530`                      | PageHeader icon button                                                                                          |
| Corp wallet                              | pointer only                          | `/corp/wallet` (`routes/CorpWallet.tsx`), see Pointers                                                          |

## Route, nav, redirects

- `/wallet` nav item: `src/app/navDestinations.ts:197-204` (`group: 'economy'`, `gating: 'scope'`, `mobileTab: true`, `aliasTabs: ['transactions']`).
- Route is `UNGATED` in `src/app/routeScopes.ts:123`: Balance mixes wallet + loyalty reads, each panel renders its own re-login banner.
- Global shortcut `W` → `/wallet` (`src/lib/shortcuts.ts:182`). No page-specific shortcuts.
- Redirects in `Wallet.tsx`:
  - no active Character → `/characters` (`Wallet.tsx:509`).
  - `?owner=corporation` (old bookmark) → `/corp/wallet` keeping query, and `tab === transactions` adds `view=transactions` (`Wallet.tsx:514-519`).
  - `/wallet/transactions` → `/market/history/transactions` (`Wallet.tsx:522`).
  - Unknown tab segment → default tab `balance` via `TabRoute`.
- Tab state is a path segment (ADR 0015); `usePageTab(WALLET_TABS)`.
- Palette: Command Palette matches `Wallet › LP Store` via search keys (`navDestinations.ts:101` comment). LP Store itself is a Market sub-view (`/market/lp-store`, `navDestinations.ts:193`).

## Data sources and scopes

| Data                               | Loader                                                            | ESI endpoint / source                                                                            | Scope                                 |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| ISK balance                        | `features/character/wallet.ts` `loadWalletBalanceWithStatus`      | `getCharacterWallet`                                                                             | `esi-wallet.read_character_wallet.v1` |
| Journal                            | `loadWalletJournal` (paged, `truncated` flag)                     | `getCharacterWalletJournal`                                                                      | same                                  |
| Fills (only to name journal items) | `loadWalletTransactions` → `loadPersonalFills` (`Wallet.tsx:158`) | `getCharacterWalletTransactions`, capped at `MAX_TRANSACTION_PAGES = 5` (`esi/endpoints.ts:502`) | same                                  |
| Loyalty points / EverMarks         | `features/character/loyalty.ts`                                   | `getCharacterLoyaltyPoints`                                                                      | `esi-characters.read_loyalty.v1`      |
| Corp names for LP rows             | `features/character/names` `resolveNames`                         | `postUniverseNames`                                                                              | public                                |
| Item names on journal lines        | `features/character/typeNames.ts`                                 | local SDE `types.json`, then `postUniverseNames`/`getUniverseType`                               | public                                |
| Mining tax links                   | Dexie `miningTaxAssignments` (`linkedRefIds`)                     | local                                                                                            | none                                  |
| LP-store corp list                 | `loadLpCorporations` (`@/sde/loadMarketSde`)                      | local SDE                                                                                        | none                                  |

- Cache keys: `wallet:balance`, `wallet:journal`, `wallet:transactions`, `loyalty` (`wallet.ts:24-28`, `loyalty.ts`).
- Auth-failure handling: balance and loyalty use `loadWithCacheStatus` → `needsReauth`; 401/403 shows grant banner not "offline".
- Page snapshot: `useRouteSnapshot(loadWalletSnapshot, …, {cacheKey:'wallet'})` loads balance + journal + loyalty in parallel (`Wallet.tsx:119`). Personal fills load separately and only once Journal is opened (kept alive after, `Wallet.tsx:274-289`).
- Cross-character balances: `loadAllCharactersWalletBalances` (`wallet.ts:75`) checks the wallet scope up front per Character from `db.tokens`, fans out at `ESI_FANOUT_CONCURRENCY`, never provokes a live 403. Characters without scope go to `skipped`.

## Page header

- Title "Wallet". Meta: `DataAgeBadge` of the staler of balance and loyalty fetch (`oldestFetchedAt`, `Wallet.tsx:313-319`).
- Action: Refresh icon button (`wallet.refresh`); disabled while loading. Refreshes snapshot + personal fills (`handlePersonalRefresh`, `Wallet.tsx:290`).
- Offline copy: first load from cache shows `common.offlineTitle`; a manual refresh that still falls back shows `common.refreshFailedTitle` (`Wallet.tsx:297`).
- `Tabs` control: Balance, Journal only (no Transactions entry).

## Balance tab

Character filter (`CharacterFilterControl`) rides in each panel's meta. Absent when the account has one Character (`Wallet.tsx:237-244`). State in `?char=` (codec `characterFilterParam`, default = synced Settings "default character filter" `useDefaultCharacterFilter`; URL value never written back to the setting). Options: This character / All characters.

### Single-Character panel ("Balance")

- ISK figure, toned by sign (`iskToneClass`, `formatIsk(…, 2)`).
- EverMarks figure (Paragon corp 1000419 split out of the LP list, `splitEverMarks`, `loyalty.ts`) with `InfoTooltip` explaining EverMarks. Shows "unknown" when loyalty missing or needs re-auth.
- States: `balanceNeedsReauth` → `GrantBanner` for `getCharacterWallet` ("Log in again with EVE Online"); no cache → `EmptyState` "No wallet data cached. Couldn't load it yet. Try again shortly."; any cached data → offline notice.
- Balance-history chart below the figures, only when the journal has entries with a `balance` (see Chart).
- Journal truncation warning (`common.incompleteTitle` + "Some pages failed to load. Refresh to try again.") above the chart.
- Empty journal: `CachedEmptyState` (never fetched vs fetched empty texts differ).

### All-Characters panel ("Balance by character")

- Total ISK across visible Characters (needs-reauth or unfetched Characters excluded from sum, not counted as 0; `wallet.ts:109`).
- Per-Character notice for each Character without wallet access: "<name> — This character hasn't granted wallet access" (filtered to the selected set).
- `DataTable`: columns Character (sticky start, sortable), ISK (sortable; reauth rows sort first via `-Infinity`; shows "Log in again to see your wallet" in warning, "unknown" when missing). `responsive="table"`. Sort in URL (`balance.sort`, default Character asc).
- Panel actions: Refresh (balances only, `refreshWalletBalances`), `TableActionsMenu` (surface `wallet-balances`; columns Character, ISK; blank not 0 for unreadable).
- States: spinner while loading; `EmptyState` "No wallet data cached" when no rows.
- Fetched lazily: nothing beyond the active Character loads until the filter asks for more (`Wallet.tsx:256-265`).

### Balance-history chart (`features/character/WalletBalanceChart.tsx`)

- Lazy-loaded (Recharts kept out of initial bundle). Line of each journal entry's own `balance` over time, oldest first (`engine/wallet/balanceHistory.ts`: sorts by date, drops entries missing `balance`).
- Stroke colour by overall trend: up positive, down negative, flat accent (`walletBalanceTrend`: first vs last point).
- X axis: max 5 ticks, `timeAxisTicks`; shows time-of-day ticks when span is short. Y axis compact ISK. Tooltip: date label + balance.
- A11y: `role="img"` with label "Balance history" plus a sr-only `DataTable` (Date, Balance) as sibling.
- Time zone from user setting (`useTimeZone`).

### Loyalty Points panel

- Header actions: `LpStorePicker` (size sm, always shown, even with no LP: entry to any corp's store, issue #2321) and `TableActionsMenu` (surface `loyalty-points`; only when there are non-Paragon rows).
- Table columns: Corporation (accent link to `/market/lp-store/<corpId>`, sortable by name), Loyalty Points (right, bold, sortable, default sort desc), caret column. Whole row click navigates to the store. No row menu, no More-actions button (per `Wallet.test.tsx:168`; DESIGN §6c).
- Sort in URL (`loyalty.sort`).
- States: `loyaltyNeedsReauth` → `GrantBanner` (`getCharacterLoyaltyPoints`); no data / only EverMarks → `CachedEmptyState` "No loyalty points …".
- CSV columns: Corporation (name or `#id`), Loyalty Points.
- Always uses the active Character's LP (not affected by `?char=`).

### LP Store picker (`features/loyalty/LpStorePicker.tsx`)

- Select-style button; opens a dialog popover with search field pinned above a list of every NPC corp that runs an LP Store (`loadLpCorporations`, SDE). Corps the active Character holds LP with are pinned first with their balance (`lpStorePickerOptions`).
- Keyboard: focus moves to search input on open; Arrow/Home/End move highlight (`aria-activedescendant`); Enter or click opens `/market/lp-store/:corporationId`; Escape closes and returns focus to trigger. Hand-built ARIA.
- Reads cached LP via `loadCharacterLoyaltyPoints`.

## Proving a payment to someone else (e.g. a corp)

| Step               | Where                                                         | Notes                                                                                                                       |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Find the line      | Wallet > Journal                                              | Filter Ref type (`player_donation`, `contract_price` ...), date range, search description/reason. Active Character only     |
| Copy the facts     | Journal CSV / Excel / copy-for-Sheets                         | Filtered rows; includes Date (ISO), Type, Amount, Reason, Context ID, First/Second party ID. No per-row "copy proof" action |
| Contract payment   | Contracts page; contract id in Mining Settle up record        | Contract id is the reference the receiver can search in game                                                                |
| See the app's link | Mining > Tax row > payment links card; Journal "Mining tax →" | Shows which Assignment a journal line or contract is linked to                                                              |
| Corp side          | `/corp/wallet` journal (needs `canReadWallet`)                | Same table; only for members with the wallet role                                                                           |

Gaps: no share link or screenshot-friendly view of one journal row; journal lags ESI; a donation carries only the reason text the sender typed.

## Journal tab (`/wallet/journal`)

Panel "Journal". Panel actions: link "Transactions →" (to `/market/history/transactions`), `TableActionsMenu` (surface `wallet-journal`), `DataAgeBadge` of the journal fetch.

Table (`features/character/WalletJournalTable.tsx`, shared with `/corp/wallet`):

- Columns (`walletJournal.tsx`): Date (nowrap, dim), Type (humanized ESI `ref_type`; always visible, titles each card on phone), Description, Amount (right, tone by sign), Balance (right, dim). Description and Balance are `phoneHidden`.
- Sortable columns: date, refType, description, amount, balance (`JOURNAL_SORT_COLUMN_IDS`). Default Date desc. Sort in URL `journal.sort`; a sort on a hidden column survives until it returns.
- `responsive="table"` (plain table sideways-scrolling on a phone, DESIGN §6c) and `virtualize="auto"` (every page, uncapped; thousands of rows).
- Column picker (`ColumnPickerMenu`: button "Columns", reset): toggle Date/Description/Amount/Balance. Type is not in the catalog. Device-local setting `walletJournalVisibleColumns`, **shared with the corp journal**.
- Filter bar (`FilterBar`; mobile: funnel sheet with active count, search stays in the row):
  - search box "Search description…" (matches the description the table shows, incl. daily-goal names, and raw `reason`; bounty lines' raw kill list is excluded from reason match) → `journal.q`.
  - Ref type `Select` (distinct raw `ref_type` values present, sorted, "All types") → `journal.refType`.
  - Date range From/To (inclusive `YYYY-MM-DD`) → `journal.start`, `journal.end`.
  - ANDed. Filter state in URL under the `personal` group (`useUrlFilter`).
- Filtered summary line when a filter/search is active: "N entries, net ±ISK" (net toned by sign; net counts missing `amount` as 0; `journalNetTotal`).
- Filtered-empty state "No journal entries match this filter." with **Reset filters** button when a filter is active.
- Banners: offline (`common.offlineTitle`/refresh-failed) when `fromCache`; truncation "Incomplete — Some pages failed to load. Refresh to try again."
- Empty (no data): `CachedEmptyState` ("No journal entries cached / Reconnect…" vs "No journal entries").
- Highlight: `highlightRowKey` from `?highlight=<journal id>` (`useHighlightParam`) scrolls to and pulses that row. Target of `walletBalanceChanged` alerts (decision `20260905-195857`).

### Description cell (`JournalDescriptionCell.tsx`)

- Plain ESI `description` by default.
- Daily-goal lines (`dailyGoalMessageIdOf`): goal name from `wallet.dailyGoalNames` map; unnamed goal shows "Daily goal" with hover "Goal id N".
- Bounty lines: reason replaced with kills summed per pirate faction (`BountyFactionSummary`).
- Other `reason` (e.g. corp memo): dim second line.
- Contract context (`context_id_type === contract_id`): "Contract →" link to `/contracts/history?highlight=<id>`.
- Mining-tax link: "Mining tax →" to `/mining/tax?tax.payment=journal:<id>` or `contract:<id>` when a Moon Mining Tax Assignment links that payment (`miningTaxHrefFor`, reads every Character's Assignments).
- Market line: when the journal line's fill is loaded (by `journal_ref_id` or `market_transaction_id` context; `journalTransactionLinks`), shows item icon + name ×qty as `ItemInfoLink` (Show info). Tooltip: "Bought/Sold N × unit = total". Escrow and broker-fee lines carry no key so stay unlinked.

### Journal export (CSV / XLSX / copy)

`TableActionsMenu` button offers CSV, Excel, copy-for-Sheets (`common.tableExport.*`). Exports the filtered rows in the table's sorted order, with `truncated` flag. Columns: Date (raw ISO), Type, Description, Amount, Balance, Tax, Reason, Context ID, Context type, First party ID, Second party ID (`walletJournalCsv.ts`). Blank, not 0, for omitted fields.

## Mobile behaviour

- Journal: `responsive="table"`, Description and Balance hidden on phones, filters collapse into a sheet; date range kept on one row inside the sheet (test `Wallet.test.tsx:522`).
- Character filter trigger is icon-only below `md` (avatar or all-characters glyph).
- "Transactions →" link has 44px min hit area below `md`.
- LP table and balance table: `responsive="table"`.

## Pointers (not documented here)

- Personal transactions live on Market › History › Transactions (`/market/history/transactions`).
- Corp wallet `/corp/wallet` (`routes/CorpWallet.tsx`, `features/corp/wallet.ts`): per-division balances/journal/transactions; reuses `JournalTable` and the same column setting. Gated by `canReadWallet` capability. Decision `20260929-131220-corp-wallet-moves-to-the-corp-section`.
- LP Store pages `/market/lp-store[/:corporationId]` (`routes/LoyaltyStore.tsx`): offers ranked by ISK/LP. Decision `20261002-145653`.
- Notification event `walletBalanceChanged` (feed-only default, scope `getCharacterWallet`, `features/notifications/events.ts:191`).
- Moon Mining Tax payment linking (`features/miningTax/LinkWalletPaymentDialog.tsx`) reads wallet journal.

## Observed gaps (facts from code)

- No income/expense breakdown by ref type for a date range; only the filtered net total (`WalletJournalTable.tsx:151`) (#2858).
- Journal tab and the balance chart are the active Character's, unless the URL names another with `?char=<id>` (alias `?chars=<id>`): then the whole page follows that Character, the readout says "Name only", a ‹ Wallet crumb shows when arriving from the Wallet chart, and the active Character is not switched. Otherwise the `?char=current|all` filter only affects the Balance panel.
- All-characters Balance has no history chart and no per-row actions; Character rows do not link anywhere.
- Journal tab never shows a re-login banner: `loadWalletJournal` exposes no `needsReauth`; a revoked wallet scope shows the generic cached-empty state (Balance tab does show the grant banner).
- Item names on journal lines come from at most 5 pages of transactions (`MAX_TRANSACTION_PAGES`); older journal lines stay unlinked (documented in `journalTransactionLink.ts`).
- `CharacterFilterControl` offers only This/All (partial subsets removed); `Wallet.tsx` still handles an arbitrary id Set.
- Loyalty table has no search, filter or Paragon row (EverMarks sits in the balance box only); balance there ignores the Character filter.
- Journal has no per-row context menu or More-actions (only the table-wide export menu).
- No page-specific keyboard shortcuts; only global `W`.
- Help/FAQ (`features/help`, `features/faq`) say nothing about the Wallet page beyond the "what we store" list (wallet is among API-derived data cached locally, `settings.faq.store.local.esi`).

## Persistence and sync

| State                            | Where                                                                                                                           | Synced                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Tab                              | URL path segment `/wallet/<tab>` (ADR `docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`)                            | no                                    |
| Character filter                 | `?char=`; default from synced Settings default-character-filter (`useDefaultCharacterFilter`); URL value is never written back  | default synced, URL not               |
| Journal filter / sort            | `?journal.q`, `journal.refType`, `journal.start`, `journal.end`, `journal.sort`; balance `balance.sort`; loyalty `loyalty.sort` | no                                    |
| Journal visible columns          | device-local `walletJournalVisibleColumns`, shared with corp journal                                                            | no (view prefs are not Editable Data) |
| Highlighted row                  | `?highlight=<journal id>`                                                                                                       | no                                    |
| Balance, journal, fills, loyalty | Dexie ESI cache per Character (API-Derived Data, never synced through the backend, `CONTEXT.md` glossary)                       | no                                    |
| Mining-tax links                 | Dexie `miningTaxAssignments`                                                                                                    | synced elsewhere (Mining Tax)         |

## Decisions (why)

- Wallet alerts key on the journal entry id so the deep link can pulse one row: `docs/context/decisions/20260905-195857-wallet-alerts-key-on-the-journal-entry-not.md`.
- Corp wallet left Wallet for the Corp section: `20260929-131220-corp-wallet-moves-to-the-corp-section.md`.
- Personal fills moved to Market › History: `20261001-113143-date-market-order-fills-from-wallet-transactions.md` (reads transactions) and `routes/Wallet.tsx` comments.
- LP Store lives under Market, balances stay on Wallet: `20261002-145653-lp-store-under-market-pilot-lookup-its-own.md`; picker shape `20260930-144709-select-box-lp-store-picker.md`; loyalty scope gate `20260929-224008-lp-store-browsing-keeps-the-loyalty-scope-gate.md`.
- Character filter sits in the panel header and shrinks to This/All: `20260908-192806-the-character-filter-rides-in-the-panel-header.md`.
- Route ungated, panel-gated: `src/app/routeScopes.ts:120-123`.

## Formulas and edge cases

- Total (all-Characters) = sum of `balanceResult.data` over visible entries; entries with `needsReauth` or no result are skipped, not zero (`wallet.ts:109-114`).
- Balance chart points: entries with numeric `balance`, sorted by `date` string ascending (`balanceHistory.ts`); trend = last − first (>0 up, <0 down, else flat; <2 points flat).
- Journal filter: ref type exact on raw ESI `ref_type`; dates compare the `YYYY-MM-DD` slice of `entry.date` lexicographically, inclusive both ends; text matches the displayed description or raw `reason` (reason skipped for bounty and daily-goal lines) case-insensitively; all ANDed (`walletJournalFilter.ts:48-72`).
- Net total over filtered rows treats missing `amount` as 0; shown only when a filter or text is active and rows > 0.
- Mobile filter count excludes the text box (always visible) and counts ref type, start, end.
- EverMarks = LP of corporation 1000419 (Paragon); 0 if absent, "unknown" if loyalty not loaded/needs re-auth.
- Journal truncation: fewer pages came back than advertised (`CachedResult.truncated`).

## Test-covered behaviours (`src/routes/Wallet.test.tsx`)

Default Balance; EverMarks + other LP table; LP row link + caret, no row menu; picker without LP (#2321); EverMarks tooltip; empty/re-login states for loyalty; journal concatenates pages newest-first; item line linked to Show info; notification deep link opens Journal; `/wallet/transactions` redirect (#1749); highlight pulse; ref type humanized; offline fallback; truncation warning present/absent; ref/text filters; net total tone (#1961); filtered summary (#1721); filtered-empty + reset; no-data empty; failed refresh vs initial offline (UX-REVIEW #10); 401 re-login (BUG #3); mobile date range on one row; cross-character: no filter for one Character, filter rides in header across panel swap, no picker-driven fetch by default, All shows total, synced default opens on All, skipped notice only for selected Characters (#607).

## Interview Q&A

1. **Where did Transactions go and why?** Personal fills are Market › History › Transactions; Wallet keeps a "Transactions →" link and redirects `/wallet/transactions`. `src/app/pageTabs.ts:83-94`, `src/routes/Wallet.tsx:521-522`.
2. **How does the app avoid raising a re-auth banner for an alt in All-characters view?** Scope is checked from `db.tokens` before any call; no-scope Characters go to `skipped` with a notice. `src/features/character/wallet.ts:75-106`.
3. **What happens to the total if an alt needs re-login?** Its row shows "Log in again to see your wallet" and it is excluded from the sum (not zero). `wallet.ts:109-114`, `Wallet.tsx:379`.
4. **Why does the journal name items sometimes and not others?** Lines link to a fill by `journal_ref_id` or `market_transaction_id` context; only 5 transaction pages are loaded; escrow/broker fees have no key. `journalTransactionLink.ts`, `esi/endpoints.ts:502`.
5. **What is the balance chart plotted from?** Each journal entry's `balance` field, not a stored daily balance; so it only goes back as far as the cached journal. `balanceHistory.ts`, `Wallet.tsx:441`.
6. **Why are fills fetched only on the Journal tab?** Balance would otherwise wait on a cursor walk it never shows; kept alive after first visit. `Wallet.tsx:153-162, 274-289`.
7. **How does a wallet alert land on the right row?** `walletBalanceChanged` deep link `/wallet/journal?highlight=<id>`; `useHighlightParam` + `highlightRowKey`. `Wallet.tsx:185`, `notificationOptions.ts`.
8. **Why can the Journal tab show "No journal entries cached" for a revoked scope?** The journal loader returns no needsReauth flag; only Balance shows the grant banner. `Wallet.tsx:782` vs `Wallet.tsx:636`.
9. **What does the journal column picker control and where is it stored?** Date/Description/Amount/Balance (Type fixed); device-local setting shared with corp journal. `walletJournalColumns.ts`.
10. **How does the Character filter default?** URL `?char=` else synced Settings default; one-Character accounts never see the control. `Wallet.tsx:202-244`.
11. **What do the CSV exports contain?** Journal: filtered rows in table order incl. tax/reason/context/party ids, truncated flag; balances: raw numbers with blanks for unreadable; LP: corp name + points. `walletJournalCsv.ts`, `walletBalancesCsv.ts`, `loyaltyPointsCsv.ts`.
12. **Why is EverMarks outside the LP table?** Paragon (1000419) is a distinct in-client currency but ESI returns it in the same array; split out for the balance box. `loyalty.ts:36-43`.

## Improvement ideas

- Show a grant banner on the Journal tab when the wallet scope is missing.
- Per-Character journal view or Character column when the filter is All.
- Link All-characters balance rows to that Character's journal.
- Persist a real daily balance series so the chart is not limited to cached journal depth.
- Search/filter on the Loyalty table, and a "value in ISK" estimate per corp (LP value engine exists under `features/loyalty/lpValue.ts`).
- Row menu on journal lines (copy ref id, open counterparty).
- Mention Wallet scope and data handling in Help/FAQ.

## LP Store: wallet-side hooks (page spec lives in `docs/features/market.md` section 5)

The LP Store page `/market/lp-store[/:corporationId]` (`src/routes/LoyaltyStore.tsx:427`) is Market's, documented in full in `market.md` (offers ranked by ISK/LP, hub and price basis, affordable-only default on, offer detail, LP Value setting, fee-netting profit formula `profit = revenue − salesTax − brokerFee − iskCost − requiredItemsCost − buildCost`). Only the Wallet side is specified here:

| Hook                | Code                                                                | Behaviour                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LP table row / name | `Wallet.tsx:330-336`, `:753`                                        | name is accent `Link` to `/market/lp-store/<corporation_id>`; row click does the same; caret closes the row (DESIGN §6c). Show info for the corp is on the store page header, not here                                                                                                     |
| LP Store picker     | `Wallet.tsx:717` → `LpStorePicker.tsx:51`                           | `corporationName={null}`, size sm, width `w-44`, always rendered, even with 0 LP (issue #2321)                                                                                                                                                                                             |
| Picker option order | `lpStorePickerOptions.ts`                                           | corps with `loyalty_points > 0` first, highest balance first with the balance shown; rest alphabetical; a typed query uses `rankedSearch` over all corps but held corps stay pinned above; only corps in `lpCorporations.json` appear (Paragon/EverMarks has no store so is never offered) |
| Picker data         | `LpStorePicker.tsx`                                                 | `loadLpCorporations` (SDE) and `loadCharacterLoyaltyPoints`; failures are swallowed (list stays empty) per `market.md` gaps                                                                                                                                                                |
| Scope gate          | `routeScopes.ts` (LP store entries ~37-41, 262-263 per `market.md`) | store pages need `esi-characters.read_loyalty.v1` even to browse a store with 0 LP (decision `20260929-224008`); Wallet itself stays ungated and shows a grant banner in the LP panel                                                                                                      |
| Legacy URLs         | `src/app/legacyPaths.ts`, `App.tsx`                                 | `/wallet/loyalty[/:id]` redirects to `/market/lp-store[/:id]`                                                                                                                                                                                                                              |
| Command Palette     | `navDestinations.ts:101,193`                                        | "Loyalty points" alias finds the LP Store sub-view                                                                                                                                                                                                                                         |
| Reuse elsewhere     | `features/loyalty/LpStoreLink.tsx:22`                               | icon link used by Appraisal's LP column and Blueprint Acquisition                                                                                                                                                                                                                          |
| Cached LP for hints | `loyalty.ts:readCachedLoyaltyBalances`                              | palette's LP Stores group reads the cache; empty until the Wallet loyalty view has loaded once                                                                                                                                                                                             |

Interview Qs (LP, wallet side): **Why does Wallet show LP at all if the store moved to Market?** Balances are the character's wallet-like data; shopping is a market errand (`20261002-145653`). **Why is EverMarks not in the LP table?** It is split out into the balance box and has no store. `loyalty.ts:36-43`, `lpStorePickerOptions.ts` header. **What if the loyalty scope was never granted?** Wallet LP panel shows `GrantBanner`; the picker still opens stores but the store page's route gate asks for the grant.

## Corp wallet: the shared surface (`/corp/wallet`, full spec in `docs/features/corp.md` section 3)

- Shared with personal Wallet: `JournalTable` (`WalletJournalTable.tsx`), `useJournalColumnsBuilder` (`CorpWallet.tsx:70`; same columns), `JournalDescriptionCell`, filter helpers and CSV columns (`walletJournalCsv.ts`), and **one column-visibility setting** `walletJournalVisibleColumns` (`walletJournalColumns.ts:14`, read at `WalletJournalTable.tsx:153`), so hiding Balance on one hides it on the other.
- Different: corp journal is per division (`?division=1..7`, `DIVISION_PARAM`, `CorpWallet.tsx:102`), has a Journal/Transactions switch (`?view=`), no `highlightRowKey` (alerts are character events), no mining-tax link builder (`buildJournalColumns(linkFor, nameForType)` passes no `miningTaxHrefFor`, `:473`), and its own `useUrlFilter` group so the `journal.*` keys do not collide with the personal group (`walletJournalFilter.ts` comment).
- Old links: `/wallet?owner=corporation&division=N[&tab=transactions]` redirects to `/corp/wallet?division=N[&view=transactions]` (`Wallet.tsx:514-519`).
- Gating: `canReadWallet` (Accountant / Junior_Accountant / Director) hides the destination when absent; scopes `esi-wallet.read_corporation_wallets.v1` + `esi-corporations.read_divisions.v1`; only the master division's journal feeds the vitals runway (`corp.md`). Decision `20260929-131220`.
- Interview: **Why can hiding a column on Corp Wallet change Wallet?** One shared device-local setting by design. **Why no Mining Tax link in the corp journal?** Mining Tax Assignments link a pilot's personal journal/contract payments; the corp journal builder is given no resolver.

## Net Worth Snapshots (data layer, #2865)

- One row per Character per UTC day in Dexie `netWorthSnapshots` (id `${characterId}:${day}`): `wallet`, `assetValue` (hub sell minimum, average price fallback, PLEX removed), `plexValue` (hangar PLEX x global PLEX price), `escrow` (buy orders), `hubId`, `updatedAt`. Pure builder/merge/gap helpers: `src/engine/netWorth/snapshot.ts`; writer: `features/netWorth/recordSnapshots.ts`; trigger: `NetWorthSnapshotRecorder` in `Layout` (Tab Leader only). A Character missing the wallet, assets or orders scope gets no row. Synced as an Editable Data collection (`netWorthSnapshots`, last write wins per id) and deleted with the Character. No UI yet: the chart is #2935, the drill-down pages #2936. Decision `20261007-184320`.
