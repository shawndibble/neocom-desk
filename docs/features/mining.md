# Mining

Route `/mining`. Two tabs. Overview = personal mining output (ISK, ISK/day, m3, raw vs refined), all ore/ice/gas, last 90 days kept on device. Tax = Moon Mining Tax ledger: moon-ore sessions you owe rent on, to whom, how much, paid or not. Internal names stay `MoonMiningTax` / `miningTax` (decision `20260905-215631`); user-facing label "Mining" (nav key `nav.miningTax`).

User goals: Overview = "what did I mine, what is it worth, ISK/day". Tax = "never miss an alt's obligation, bill each landlord the right amount at the right price, know what is paid".

| Feature | Where |
| --- | --- |
| Route shell, Character gate, tab bar | `src/routes/MoonMiningTax.tsx` |
| Overview: tiles, charts, table, day detail | `OverviewTab.tsx`, `MiningYieldCharts.tsx`, `YieldDetailModal.tsx` |
| Overview prefs (range, basis, buyback %, refining, chart metric, columns) | `OverviewSettings.tsx`, `*Pref.ts`, `overviewColumns.ts` |
| Tax: owed cards, attention strip, continue card, ledger, selection toolbar | `TaxTab.tsx`, `OwedBalances.tsx`, `AttentionStrip.tsx`, `ContinueSessionCard.tsx`, `SelectionToolbar.tsx` |
| Row detail, Assign, combined summary, edit | `RowDetailModal.tsx`, `AssignDialog.tsx`, `GroupSummaryModal.tsx`, `EntryEditDialog.tsx` |
| Split, Combine, bulk dismiss | `SplitDialog.tsx`, `JoinAssignDialog.tsx`, `BulkDismissDialog.tsx` |
| Settle up, link payment / transaction / wallet payment | `SettleUpDialog.tsx`, `LinkPaymentDialog.tsx`, `LinkTransactionDialog.tsx`, `LinkWalletPaymentDialog.tsx` |
| Payees, Ore tags, page settings | `PayeeManagerDialog.tsx`, `TypeOverridesDialog.tsx`, `src/features/settings/MiningTaxSettingsForm.tsx` |
| CSV | `yieldCsv.ts`, `taxCsv.ts` via `TableActionsMenu` |
| Pure engine | `src/engine/miningTax/*`; refining math `src/engine/industry/{reprocessing,characterModifiers}.ts` |

Paths below are under `src/features/miningTax/` unless stated.

## 1. Route, URL, gating

- Tab = path segment (ADR 0015, `docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`): `/mining` -> Overview (first tab = default), `/mining/overview`, `/mining/tax` (`MINING_TABS`, `src/app/pageTabs.ts:78`). Mining opens on Overview (decision `20260924-202220`). Old path `/moon-mining` renamed twice (`20260905-215631`, `20260922-231132`).
- Nav: `progression` group, `mobileTab: true`, `gating: 'scope'` (`src/app/navDestinations.ts:167`).
- Scope gate: `getCharacterMining` (ESI `esi-industry.read_character_mining.v1`, `src/esi/registry.ts:342`); also public `getUniverseSystem`, `postUniverseNames` (`src/app/routeScopes.ts:280`). Missing scope: `ScopeGate` re-auth page. Per-character lapse inside the page: re-auth banner, other Characters keep rendering.
- Not in the gate (degrade silently): wallet journal and contracts scopes used by made-payment suggestions (`madePayments.ts:98`); Character skills/implants for refine yield (note "assumes no implants").
- Shell (`MoonMiningTax.tsx`): store not hydrated -> spinner; no active Character -> `<Navigate to="/characters">`; otherwise tab. Each tab renders its own `PageHeader` (header actions are tab controls). Container `max-w-6xl`.
- URL state, scoped keys so switching tabs does not leak (`TaxTab.tsx:314`): Overview `overview.character`, `overview.sort`; Tax `tax.character`, `tax.payee` (comma-joined sorted Payee ids, absent = all), `tax.sort`, `tax.historySort`. A payment deep-link param (`paymentDeepLink.ts`, `PAYMENT_REF_PARAM`) is read once at mount then stripped (`TaxTab.tsx:461-476`); used by Wallet journal "Mining tax" links (#2818).
- Hand-edited/stale ids: unknown Payee ids are dropped; if all are dropped the filter reads "all" (`TaxTab.tsx:535-543`).

## 2. Data sources and persistence

| Data | Source | Stored where | Syncs? |
| --- | --- | --- | --- |
| Personal mining ledger | ESI `GET /characters/{id}/mining/` (paged, conditional fetch, cache key `miningTax:ledger`), `ledger.ts:23` | Dexie ESI cache | no |
| Ledger history (Overview only) | merge of each fetch, `db.miningLedgerHistory` | Dexie, per Character | no (device) |
| Daily Jita price snapshots | Fuzzwork `getHubPrices` saved on each Overview load, `db.jitaPriceSnapshots` | Dexie, pruned to 90 days | no |
| Server hub snapshots | `loadHubSnapshotRange` (Fuzzwork 6h capture; Adam4EVE backfill) | Firestore read (public) | read-only |
| ESI market history (daily avg) | `loadPriceHistory(Jita region)` | ESI cache | no |
| Payees, Assignments | user data, `db.payees`, `db.miningTaxAssignments` (index `[characterId+date+solarSystemId]`) | Dexie | yes (Firestore via `planSync`, `scheduleSync(characterId)` after commit; deletes leave tombstones) |
| Ore tags (moon / ignored) | `typeOverrides.ts` | Dexie settings `sync.*` keys | yes (`20260923-112603`) |
| Ore Form, per-ore value mode | `oreForm.ts`, `oreValueMode.ts` (`createSyncedSetting`) | Dexie settings | yes |
| Overview range/basis/buyback/refining/chart metric/columns | `createLocalSetting` = one Dexie `settings` key each (NOT localStorage) | Dexie | no (device) |
| Auto-continue, dismissed continuations, ore-arrival log | `continueSessionPref.ts`, `oreArrivalLog.ts` | Dexie settings | no (device) |

- Refresh tokens stay in Dexie only (CLAUDE.md). FAQ "what we store" lists mining tax synced data and local mining history (`src/features/faq/whatWeStore.ts`).
- Why own-character ledger, not corp observer: observer endpoint needs Accountant role in the moon-owning corp, never held by a renter. Granularity ceiling = (Character, EVE/UTC date, system); no moon id, no timestamp (`20260905-170644`).
- ESI returns only the last 30 days (comment `ledger.ts:38-43`, `20260922-204846`). Tax reads ESI's 30-day ledger directly (`loadAllCharacterLedgers`, `ledger.ts:80`, called by `snapshot.ts:7`); only Overview folds in the device history (`loadAllCharacterYields`, `ledger.ts:151` -> `withLedgerHistory`, `ledger.ts:44`, history kept `LEDGER_HISTORY_DAYS = 90`, `src/engine/miningTax/ledgerHistory.ts:13`). Tax rows are built from ledger entries only (`snapshot.ts:122`), so a Tax row disappears once its date leaves ESI's window; its Assignment stays in Dexie, but Payee balances are computed from rows (see gaps).

## 3. Overview tab

Purpose: output stats. All tracked Characters (not just active). Files: `OverviewTab.tsx`, `yieldSnapshot.ts`, `ledger.ts:141 loadAllCharacterYields`.

Load (`loadMiningYieldSnapshot(showRefining, compressed)`, `yieldSnapshot.ts:158`):
1. Per Character ledger (fan-out at `ESI_FANOUT_CONCURRENCY`), merged into device history, grouped by (date, system) over harvested set = ore + ice + gas clouds + manual moon tags + manual ignores (`groupMiningYield`).
2. Pricing type per ore = Compressed counterpart when Ore Form = Compressed and one exists (`oreFormTypeId`, `src/engine/miningTax/oreForm.ts:7`). Gas prices as itself.
3. If Show refining: load reprocessing recipes (`loadReprocessing`), Character modifiers (skills, implants). If off: skip recipes, material prices, skills/implants.
4. ESI price history per type (Jita region). A `400` (non-tradable ore/ice variant) is tolerated per id as "no price"; any other failure throws unless cached history exists (`yieldSnapshot.ts:246-260`).
5. Live Jita book from Fuzzwork for every priced type; saved as today's snapshot (`saveTodayPriceSnapshot`, merge per type, prune > 90 days, `priceSnapshots.ts`). Save failure swallowed.
6. Server snapshots merged into the `saved` tier (server wins on a day both have), Adam4EVE into `historical`.
7. Every row valued on all four bases up front (`byBasis`), so switching basis never refetches.
8. Volumes: SDE, else live ESI `getUniverseType`, cached `STALE_AFTER.static`; a confirmed `null` volume is also cached.

Overview always prices at Jita (`DEFAULT_TRADE_HUB`); Tax prices at the Payee's hub.

### Controls and defaults
| Control | Values / default | Persist |
| --- | --- | --- |
| Character filter | all / one / subset | URL `overview.character` |
| Date range | 90d, 30d (default), 7d, Today | device `miningYieldRange` |
| Price basis | Jita buy (default, "saved buy price on the day mined"), Jita sell, Now buy, Now sell | device `miningYieldPriceBasis` |
| Buyback rate | 0-100, default 100 (off) | device `miningYieldBuybackRate` |
| Show refining | default on | device |
| Chart metric | ISK (default), m3, Count | device |
| Columns picker | defaults: character, system, volume, rawValue, refineValue, pricing (off: total, oreBreakdown, units); empty selection rejected; Reset action | device `miningYieldOverviewVisibleColumns` |
| Refresh | IconButton; also fired by Show-refining toggle (it changes what the loader fetches) and Ore Form change (`useRefreshOnOreFormChange`) | - |
| Table sort | default Date desc | URL `overview.sort` |

Desktop: Value menu (basis, buyback %, refining) in header. Mobile: `MobileSettings` sheet.

### Formulas (exact)
- Range window: today counts as day 1; `7d` = today + 6 prior days; start = today - (days-1); dates are bare UTC strings, never routed through local time (`yieldRange.ts:30`). No "All" range: history caps at 90 so it would equal 90d.
- ISK per mined day = sum of raw value of in-range rows / count of DISTINCT dates with any mining; null when no dates (`yieldRate.ts:13`). It uses raw (sell-the-ore) value, not refined (`OverviewTab.tsx:294`). Days with no mining are NOT in the divisor. Why: ESI has no intra-day timestamp so no hourly rate is measurable; originally calendar hours (`20260909-204328`), later per-day (`20261006-085420`).
- Days mined tile: `daysWithData / rangeDays`; "history starts" hint when the oldest saved day is later than range start (`yieldRange.ts:64`).
- Raw value per line = unit price x quantity; price must be > 0 else the line is 0 and the row flips `pricedAll=false` (`yieldValuation.ts:101`).
- Refine value per line: `batches = floor(units / portionSize)`; each material `floor(materialQty x batches x efficiency)` (floored per material, as the game does; no invented fractions); leftover units `units - batches x portionSize` are shown, not rounded away (`reprocessing.ts:108`). Missing recipe while refining is on => `pricedAll=false`. Unpriced material => value is a floor, `pricedAll=false`.
- Efficiency (`reprocessing.ts:68`): ore/ice/moon ore = `0.5 x (1 + 0.03 Reprocessing) x (1 + 0.02 Reprocessing Efficiency) x (1 + 0.02 specialisation) x (1 + implant%/100)`; scrap = `0.5 x (1 + 0.02 Scrapmetal)` only. `BASE_STATION_REPROCESSING_RATE = 0.5`, never clamped to 1. RX-801/802/804 = +1/+2/+4% (best fitted, `characterModifiers.ts:60`). Example, all skills V, specialisation V, no implant: 0.5 x 1.15 x 1.10 x 1.10 = 0.69575. Per-line efficiency uses the type's own specialisation; the "basis hint" states a baseline without specialisation (`baselineRefiningEfficiency`).
- Buyback: every ISK figure (entry and line totals, material unit prices) x `rate/100`; quantities, `pricedAll`, source, efficiency, batches are not scaled (`buybackRate.ts:25`). Valid: finite, `0 <= rate <= 100`.
- Price resolution per type per day (`priceBasis.ts:69`): "now" bases = live price of the chosen side only (none => unpriced). Mined-day bases: saved snapshot (chosen side) -> Adam4EVE historical split (region-wide, weaker) -> ESI daily average (not the chosen side) -> live, but live only if date >= yesterday (an older day with no history = type does not trade, stays unpriced). A price must be > 0.
- Row/day price tag = weakest source of its lines, rank saved(0) < live(1) < historical(2) < average(3); `none` lines are ignored (`priceBasis.ts:140-158`). UI tags: Saved / Historical / Daily avg / Live / No price. Refine materials never affect the tag.
- Per-type chart: top 8 by value; the rest fold into "Other N types" only when there are more than 9 types (`MiningYieldCharts.tsx:54`, `topTypes.ts`: `sorted.length <= limit + 1` => no fold). Daily chart axis includes days with no mining.
- Ledger history merge (`ledgerHistory.ts:27`): a fresh row replaces a stored row with the same (date|system|type) (today's quantity grows through the day); rows only stored are kept; duplicates inside one fetch are summed first; prune counts back from the NEWEST held day, not the wall clock (`LEDGER_HISTORY_DAYS = 90`, cutoff = newest - 89). A cached copy older than the last merge is ignored so it cannot roll today back (`ledger.ts:50`).

### Table, tiles, detail
- Stat tiles: Total value (raw; refined subtitle when refining on), ISK/day, Volume (warning with count when some types lack volume), Days mined.
- Table (`DataTable`): Date always shown (accent link, opens detail), Character only when >1 Character, System (+security), Volume, Raw sell value, Total, Refine value, Ore breakdown, Units, Pricing (tag + "Partial" when `pricedAll` false). Phone stacks cells.
- Row click -> `YieldDetailModal`: "date - system", chips (volume, units, ore types), Sell raw card, Refine card (gain / loss / even / unknown vs raw), "Ore mined" table, "Refines into" table (per material qty and value; leftover-units note), Pricing section (basis hint + per-source). Each table has CSV/clipboard export.
- CSV (`yieldCsv.ts`, surface `mining-overview`): every column the table can offer, not just visible ones.

### States
- Loading: spinner. Error: `EmptyState common.loadFailed*`. Offline/stale: `common.offlineTitle` note + `DataAgeBadge(fetchedAt)` (oldest among Characters).
- Needs re-login for a Character: banner per Character with "Re-authorize" -> `beginGrant(characterId, ['getCharacterMining'])`; that Character still shows device-history rows.
- No entries: `miningTax.overview.emptyTitle/Hint`.
- Refine values with unknown implants: `ImplantsAssumedNote` / `refineAssumesNoImplantsHint`.
- Rate limits: ESI goes through `esiFetch` (retries transient, honors `Retry-After`/`X-Ratelimit-*`, CLAUDE.md); a budget refusal on price history falls back to cached history, else fails the page.

## 4. Tax tab

Purpose: Moon Mining Tax. All tracked Characters by default. Files: `TaxTab.tsx`, `snapshot.ts`, `ledgerActions.ts`, `assignments.ts`.

### Entities (CONTEXT.md)
- Mining Ledger Entry: (Character, EVE date, system) with moon-ore lines summed per type; derived each refresh, never stored (`groupLedger.ts`). Moon ore = SDE moon set + manual "tag as moon ore"; ordinary ore/ice/ignored are excluded (that exclusion is the whole moon filter).
- Assignment: stored record claiming (part of) an entry for a Payee at a tax %: `oreLines` snapshot, `estimatedValue`, `taxOwed` (both snapshotted), `status`, optional `groupId` (combined), `collectsGrowth`, `payment`, `reviewDiff` (`src/db/index.ts:659-700`).
- Payee: per-Character free-text landlord with default tax %, Trade Hub (priced at that hub, default Jita; `20260907-100006`), legacy `systemId`, learned in-game entity id (`rememberPayeeEntity`).
- Statuses (`rowStatus.ts`): unassigned, outstanding, paid, needs-review, dismissed. Open = unassigned + needs-review + outstanding (`ledgerSections.ts:3`); History = paid + dismissed.

### Load pipeline (`snapshot.ts:66`, order matters)
1. Hydrate Ore Form. 2. `loadAllCharacterLedgers` (also computes unclassified types = ESI types neither moon, ore/ice, nor ignored). 3. `recordLedgerArrivals`. 4. `coalesceAssignments` (repair Combined Entry invariants before reconcile). 5. `reconcileAssignments`. 6. `repriceForOreForm`. 7. Load Payees and Assignments (after reconcile so flips show). 8. Build rows with `computeOwnership` + `findDuplicateAssignmentIds`.
Data Age badge = oldest `fetchedAt`; `fromCache` true only if every read was cache-only (offline).

### Pricing for Tax (`pricing.ts`, `priceBasis.ts:125`)
- Value = sum of quantity x unit price; tax owed = value x taxPct/100, computed ONCE at assign time and stored (`valuation.ts:28`). Later price moves or Payee default edits never change it. Example: 1,000 units x 5,000 ISK x 10% = 500,000 ISK.
- Unit price tiers, buy side only: saved snapshot for the mined date -> Adam4EVE historical buy -> today's live buy (unconditional on date: deliberate difference from Overview) -> today's live SELL as last resort (flagged `live-sell`, softer "priced at today's sell" notice) -> none (0, "could not be priced" banner). A quoted 0 counts as unpriced.
- Priced at the entry's mined date and at the Payee's hub (`hubForPayee`; absent/unknown hub = Jita). Why: `20260926-112731` (a bill created a month later must not use today's price), `20260906-081307` (compressed ore at Jita buy), `20260926-142542` (bid-less ore at sell).
- Ore Form: Compressed (default) values and names the Compressed type when one exists, else raw; gas untouched (`20261006-185915`). Flipping re-prices Unassigned and Outstanding only (`oreFormReprice.ts:19`); Paid, Dismissed, needs-review stay frozen (frozen ISK is truth). A record with an unpriced line is skipped and retried next load, never zeroed.
- Per-ore value editing (setting "Edit ore values individually"): `oreLineValues` replaces `quantity x unitPrice` for the named lines; unnamed lines still price from the book (`valuation.ts:28`, `20260927-105434`).

### Ownership, growth, review (core engine)
- `computeOwnership` (`ownership.ts:60`): per ore type residual = entry qty - sum of covering Assignments' qty. Growth collector = the sole Assignment, or the one flagged `collectsGrowth` when 2+; a collector owns all residual (nothing becomes "unassigned", no other Assignment grows). With 2+ and no flag (legacy split): a type claimed by exactly one Assignment grows into it; a type claimed by none or 2+ stays an Unassigned residual. Snapshots never shrink.
- `diffAssignedOreLines` (`needsReview.ts:15`): reports only types whose quantity strictly GREW (a new type counts as growth from 0); equal or lower never flags (false positives on real ISK are the worse failure).
- `reconcileAssignments` (`reconcile.ts:40`): per Character, diff each Assignment against its owned fresh lines. Entry absent from the fresh read (aged out, or lapsed grant) -> left alone. Growth on an OUTSTANDING Assignment (single, or member of a combined entry) is absorbed straight in (re-priced at mined date and Payee hub, `planNeedsReviewResolution`, `assignments.ts:675`); if re-pricing throws it falls back to flagging. Growth on Paid or Dismissed flips to `needs-review` with `reviewDiff` {typeId, before, after}. Skips the write (and `scheduleSync`) when the diff is unchanged. Why: `20261004-135551` "unpaid growth has no history to protect".
- Accept new total (`planNeedsReviewResolution`): re-snapshots ore to owned fresh lines, re-prices, clears `reviewDiff`, `paidAt`, `oreLineValues`, and reverts to `outstanding` EVEN IF it had been paid (never under-states; a payee who already covered part is one "mark paid" from square).
- Duplicates (`ownership.ts:137`, decision `20260923-112236`): flagged only when identical Payee, tax % and ore lines AND the covering set together claims more of some type than the entry holds. Dismissals never count. All members returned. Shown in the Attention strip.
- `assertUnclaimed` (`assignments.ts:59`): inside the write transaction, re-reads Dexie; refuses (`AlreadyAssignedError`) when requested + already claimed (dismissals included) of a type exceeds the entry quantity; with no entry lines, any second claim refuses. Covers two tabs/devices racing.
- Split (`split.ts:17`): `planSplit` throws if a move exceeds held qty (no silent clamp); zero moves dropped; kept lines at zero dropped. `splitAssignment` throws "Nothing to move" or "Cannot move every unit - unassign instead". Each side priced at its own Payee's hub. Split is not offered on combined members.
- Coalesce (`coalesce.ts:135`): fuses only `outstanding` Assignments with no payment on the same entry with the same terms (payee:taxPct); refuses when members span >1 existing groupId; identical members that over-claim = duplicate (keep one, values NOT summed), else quantities and values summed. `planGroupEjections` (`coalesce.ts:213`): a Combined Entry whose members disagree on terms ejects the disagreeing ones (all when fewer than 2 agree). Safety net only; writes already keep the invariant.

### Combined Entries
- One obligation, one Payee, one rate, spanning EVE days (sessions crossing 00:00 UTC). Rules in `selection.ts:77 combineEligibility`: need >= 2 rows; same Character; same system; at most one distinct `groupId` (one group + ungrouped rows = add to that group); same Payee and rate across every member (`agreedTerms`). Blockers `too-few | mixed-character | mixed-system | multiple-groups | mixed-terms`, each with its own reason text.
- Combined row: "N days" toggle, summed values, date range; status = worst member status. Settle up expands to actually-outstanding members only (`settleUpMembers`) so an already-paid member is not billed twice.
- Take out (one day) / Uncombine all clear only `groupId`; figures and payment stay (`uncombineAssignments`).

### Continue a session across midnight UTC (`sessionContinuation.ts:39`)
Offered when a wholly unassigned entry has the same Character + system on the EVE day immediately before, and that day has exactly one non-dismissed Assignment that is `outstanding` with a Payee (paid = closed session; split day = no single Payee). Continue: assigns next-day ore to the previous Payee and rate, combined with previous (or added to its group); next day priced at the Payee's hub. Undo (toast) re-reads both records inside the transaction and keeps changes since; if previous was already combined, undo leaves it combined (`ledgerActions.ts:189`). Auto mode (device `miningTaxAutoContinue`) continues each new offer once; dismissals stored per next-entry key (`miningTaxDismissedContinuations`); card also offers "choose other" (opens detail) and "keep separate".

### Settle up (`SettleUpDialog.tsx`, `settleAllocation.ts`)
- Two steps: no wallet-journal link step because ESI's journal lags too far for a just-sent payment (`20260911-210622`). A recorded-but-unlinked payment is auto-matched later (`paymentLinks.ts`, no dialog).
- Items ticked per Payee (multi-Payee supported); copy buttons (amount, "to" name, reason text from systems and dates); paid-on date; method; contract id; "Pick from wallet" (made payments); primary "Record payment", secondary "Just mark paid".
- "I sent a different amount" (`allocateOldestFirst`, `settleAllocation.ts:27`): sort ticked entries by date ascending; accept each while `coveredTotal + taxOwed <= amount + 0.5 x (n+1)` (cumulative half-ISK slack per accepted entry: transfers are whole ISK, stored tax is not); STOP at the first that does not fit (never skips to a cheaper newer one); leftover = `max(0, amount - coveredTotal)`; non-finite or <= 0 amount covers nothing. Example: owed 100M (day 1) and 50M (day 2), sent 120M => day 1 covered, leftover 20M, day 2 stays owed. An Assignment is paid or owed, never half.
- Ore still arriving (`oreArrival.ts`, `20261004-213852`): `ARRIVAL_WINDOW_MS` = 1 hour (ESI's longest ledger lag). An entry's day is in-window while `dayStart + 24h + 1h > now` (`isInArrivalWindow`). `recordLedgerFetch` stamps `grewAt` when a fetched total exceeds the stored total (first sight counts as growth only if this Character was checked since that day began; non-increasing `fetchedAt` is ignored). `arrivalNotice`: `arriving` (yellow "wait ~N min"; only ticked entries count), `quiet` (small print "ESI can lag up to 1 h"), `none` (day ended > 1h ago). Never blocks. Dialog re-pulls the ledger on open and every 10 min (`RECHECK_INTERVAL_MS`) while an entry could still grow; "Checking ESI..." / "Couldn't check ESI" states.
- `settle` marks paid and stores `payment` info in one Dexie transaction.

### Made payments and links (`madePayments.ts`, `paymentMatches.ts`, `paymentLinks.ts`)
- Sources: wallet journal outgoing amounts (amount < 0, absolute value) with ref_type in `player_donation, contract_price, contract_price_payment_corp, contract_deposit` (contract refs = method contract, else donation); completed item-exchange contracts issued by the Character with price 0 and assignee != 0 (payment in kind; amount null, never priced from cargo, pilot confirms). Each Character's reads fail independently (`.catch(() => null)`); results newest first; counterparty names via `resolveNames`. Scopes: wallet journal + contracts, ungated.
- Matching: `amountsMatch(a,b)`: `|a-b| <= max(1, 0.005 x b)` (0.5% or 1 ISK); `LINK_WINDOW_DAYS = 14`, asymmetric (payment after mining; an entry dated well after the payment is no match). Suggested Payee: `suggestPayeeForSystem` pre-selects the Payee of the most recent non-dismissed Assignment in that system (date, then `updatedAt`), ranks others by use count then name; legacy `systemId` only breaks ties with no history (`suggestPayee.ts:40`).
- Link transaction attaches a reference to an already-paid row; never changes status or amount; exact-ISK match preselected "Suggested". Link wallet payment = reverse flow from the Wallet side.

### Ledger table, filters, selection
- Order: Owed cards, Attention strip (collapsed, header counts), Continue cards, filter row (Character filter, Payee multi-select "All payees / N selected", phone sort picker, export), Open, History.
- Owed cards (`balances.ts:31`): per Payee sum of `taxOwed` of `outstanding` assignments (not total across statuses); sorted owed desc then name; settled Payees included at 0; a Payee unknown on this device is skipped (the table row says "Unknown Payee"). "Days waiting" = whole EVE days from the oldest owed entry to today (`OwedBalances.tsx:8`). Follows the Character filter, NOT the Payee filter. Side cards "Unassigned entries" (count; value of unassigned ore) and "Unlinked payments". Click a card filters the table to that Payee.
- Payee filter (`TaxTab.tsx:535-557`): drops rows without a Payee (unassigned and dismissed vanish as soon as a Payee is selected); options list every Payee across all Characters, suffixed with the Character name when >1 Character; URL-held.
- Open columns: select, Character (>1 only), Date (EVE date, tooltip), System, Ore (icons; hidden below 87.5rem, #2147), Payee, Estimated Value, Tax Owed, Status pill. Default sort Date desc (`tax.sort`).
- History (`ledgerSections.ts:24`): paid and dismissed grouped by EVE month of the row's LAST day (combined row dated by its final day); months descending, rows within a month by date desc; newest month open, older folded (`TaxTab.tsx:1880`); month header "N entries, X ISK" summing `taxOwed` of assigned rows; own sort `tax.historySort`, default Date desc (`TaxTab.tsx:1469`).
- Selection toolbar: Select all, Settle up (N), Link payment, Combine (N), Dismiss (N), Clear. Selection survives filter changes but bulk actions act only on what is on screen. Dismiss counts only unassigned rows (`dismissableRows`). Each disabled action prints its reason.
- Attention strip rows: re-login per Character (action), unpriced ore (entries linked), sell-price fallback, duplicate Assignments, unclassified ore per type with "Tag as moon ore" / "Ignore" (synced overrides). Banners list affected entries as buttons (`findPricingGaps`, dismissed rows skipped).

### Dialogs
- Row detail (`RowDetailModal`): unassigned entry opens straight into Assign; assigned shows summary, primary action by status (Settle up when owed, Accept new total when grown), Edit, More (Split, Combine, Link transaction, Link wallet payment, Mark paid / un-dismiss, Dismiss, Unassign with confirm), `PaymentLinksCard`, needs-review diff.
- Assign (`AssignDialog`): Payee select + add inline; tax % input `min 0 max 100`; ore lines checklist; estimated value editable (per-ore boxes in individual mode); tax owed derived `value x pct/100`, editable (back-solves value when pct != 0, `AssignDialog.tsx:241`); "mark as paid"; valued-at-hub hint; no-payees hint.
- Combine (`JoinAssignDialog`): pick compatible same-system entries; terms adopted if any assigned, else chosen here.
- Edit (`EntryEditDialog`): one form for single/combined, owed/paid; paid stays paid ("correcting isn't un-paying"). Combined summary (`GroupSummaryModal`): per-day ore and value -> tax, Edit, Take out, Uncombine all, Unassign all (confirm).
- Bulk dismiss (`BulkDismissDialog`): itemized tick list with running total, no blind mark-all.
- Manage Payees (`PayeeManagerDialog`): union across Characters; name required; default tax % finite `0..100` (`PayeeManagerDialog.tsx:189`); Trade Hub; delete with owed entries warns: "Move and delete" to another Payee (`assignmentsMovedWithPayee`: owed days + every other day of a combined entry that contains an owed day; standalone paid days stay as history) in ONE transaction, or "Delete anyway" (`ledgerActions.ts:274-310`).
- Ore tags (`TypeOverridesDialog`): two reversible lists, tagged moon ore / ignored. Tag = counts as moon ore in both sets going forward; Ignore = only stops being flagged, never grouped into Tax (`ledger.ts:86`).
- Page settings: Ore Form (synced), Edit ore values individually (synced), Continue sessions automatically (device).

### Atomicity (verified)
Every write goes through `commit()` (`ledgerActions.ts:100`): one `db.transaction('rw', miningTaxAssignments, payees, settings)`; `write` may only await Dexie (a price fetch inside would auto-commit early: `PrematureCommitError`), so pricing for Accept new total happens before the transaction and rows are written all-or-nothing (`acceptNewTotal`). Sync is scheduled once per touched Character after commit. Actions resolve to `{ok}` or `{ok:false, reason:'already-assigned'|'save-failed'}`; the UI shows `LedgerActionError`.

### States
Loading spinner; load error EmptyState; offline note; per-Character re-auth with grant button; no Payee -> `firstPayeeTitle/Hint`; no entries -> `emptyTitle/Hint`; Open empty -> `openEmpty`; save failure -> toast `miningTax.saveFailed`; stale-view race -> refresh shows what exists.

### CSV (`taxCsv.ts`)
Table order: Character (only if shown), Date (range for combined), System, Payee (null when unassigned), Estimated Value, Tax Owed (null when no Assignment, not 0), Status. No ore, no payment data. Cell helpers are shared with the table so export equals screen.

## Reconciling with the corp's numbers

App reads only the Character's own ledger; corp observer data (moon id, timestamps) needs the Accountant role, which a renter lacks. No corp-figure import and no moon-level view exist. Likely causes of a mismatch and the fix for each:

| Cause | Check | Fix |
|---|---|---|
| Different price | Corp may use a different price or hub. App: buy side, mined-date snapshot, Payee's hub (default Jita), Compressed form | Payee hub in Manage Payees (new Assignments only); Ore Form setting; "Edit ore values individually" per-ore values; or edit Estimated Value / Tax Owed in Assign or Edit |
| Different tax % | Payee default vs corp rate | Edit entry tax %; Payee default only affects new Assignments (tax owed is frozen) |
| Ore arrived late | ESI lags up to 1 h; Needs-review flag or arrival notice | Accept new total (Outstanding absorbs growth by itself) |
| Session crossed midnight UTC | Two entries, corp bills one | Combine, or Continue card |
| Two landlords, same system/day | One entry, two bills | Split by quantity |
| Wrong ore class | Attention strip "unclassified ore" | Tag as moon ore / Ignore |
| Old bill missing | Entry older than 30 days left ESI window | None in app; Assignment stays in Dexie but is not shown or counted |
| Paid but amount differs | Sent a different amount | Settle up "I sent a different amount" (oldest first, whole entries) |

Paid stays paid when edited ("correcting isn't un-paying"). Frozen figures: later price moves never restate a bill.

## 5. Cross-feature
- Overview page Mining card: unpaid tax severity `watch`, `warning` when the oldest unpaid entry is >= 30 days (`MINING_TAX_WARNING_DAYS`, `src/features/overview/boardSeverity.ts:60`, `20260925-164801`); needs re-auth => unreadable; unassigned > 0 with nothing owed = watch.
- Calendar has a moon-chunk kind (`20260925-142253`); Wallet journal links tax payments back to the Tax row (#2818).
- Settings > Mining tax hosts the same form as the Tax page settings modal.

## 6. Test-covered behaviors (concrete assertions)
- `reconcile.test.ts`: no-op without assignments; exact match left alone; growth on a dismissed or PAID entry flips to needs-review with an explicit diff (also for a paid member of a combined entry); growth on an unpaid (outstanding) assignment, or unpaid member of a combined entry, is auto-absorbed; absorb failure (prices unavailable) flags instead; an entry aged out of the fresh read is left untouched; identical needs-review diff is not re-written/re-synced, a new diff is; a brand-new ore type folds into the sole Assignment of an entry but into neither when the entry is split across two.
- `settleAllocation.test.ts`: amount covering all pays all; pays oldest entries it fully covers; stops at the first entry the remainder cannot pay (never skips to a newer one); tolerates whole-ISK rounding of the in-game transfer; zero/non-number covers nothing.
- `sessionContinuation.test.ts`: rolls over months/years; pairs a fully unassigned day with the owed day before it in the same system; continues an already-combined session; ignores gaps > 1 day, other systems, other pilots; never continues paid/dismissed; skips when previous day split between Payees; looks past a dismissed slice; only offers days nobody assigned.
- `pricing.test.ts`: buy side not sell; Compressed counterpart priced, falls back to raw; unpriced reported by raw typeId; zero buyMax/sellMin counts as unpriced; no buy side -> today's sell flagged as sell fallback; per-hub pricing; prefers server snapshot for the date, then Adam4EVE historical split, then live; dedupes shared Compressed types; empty input calls nothing.
- `ledgerActions.test.ts`: continue combines next day into previous on its Payee/rate and syncs once; already-assigned writes nothing; undo tombstones and un-combines, changes nothing if any part fails; unassign/regroup/re-snapshot Combined Entry in one write, whole entry untouched on partial failure; writes nothing if pricing any day fails; one sync per character after the write; refused double claim -> already-assigned, other errors -> save-failed.
- `balances.test.ts`: sums only outstanding tax per Payee, owed-first, settled Payees at 0; skips unknown Payee; counts unassigned rows with live value.
- `selection.test.ts`: combine needs >= 2 rows, same character and system, agreeing Payee/tax %, not spanning two groups; adds ungrouped to one existing group. `coalesce.test.ts`: fuses two halves of one day, keeps genuine two-Payee split, ejects member whose Payee changed, never fuses a paid day.
- `src/engine/miningTax`: `ledgerHistory.test.ts` (fresh wins same key, stored-only rows kept, prune > 90 days before newest day held, same-fetch duplicates summed); `ownership.test.ts` (whole entry owned on exact match, growth owned by the sole claimant, later residual to collector only, never shrinks a snapshot); `yieldRange.test.ts` (today = day 1, month/year boundaries, inclusive ends, chart lists every day); `yieldRate.test.ts` (divides by days mined not calendar span, null for no dates).
- `taxCsv.test.ts`: column order as table, Character dropped with table, raw ISK numbers + translated status, blank tax owed for no Assignment. `snapshot.reauth.test.ts`: only the characters whose read needed re-login are reported.
- Dialog suites (`SettleUpDialog`, `PayeeManagerDialog`, `RowDetailModal`, `TypeOverridesDialog`, etc.) exist under `src/features/miningTax`; their per-test assertions were not individually read for this doc. No dedicated Mining usage article in `src/features/help` / `faq` (only "what we store" lines).

## 7. Interview Q&A

1. **Why can the app not attribute ore to a specific moon or time?** ESI's personal ledger is pre-aggregated to (Character, UTC date, system, type); the observer endpoint that has moon ids needs the Accountant role of the moon-owning corp, which a renter never has. Granularity ceiling is the entry; same-system same-day sessions for two landlords are separated by quantity (Split). `docs/context/decisions/20260905-170644-moon-mining-tax-ledger.md`; `src/engine/miningTax/types.ts:21`.
2. **How is the tax computed and why is it frozen?** `taxOwed = estimatedValue x taxPct/100`, `estimatedValue = sum(qty x unit price)` at the mined date, Payee hub, buy side; stored on the Assignment. Invoice semantics: later price moves or default-rate edits must not restate a bill. `src/engine/miningTax/valuation.ts:28`, `assignments.ts:675`.
3. **What price does Tax use when nothing was captured for a day, or the ore has no bids?** Saved -> Adam4EVE historical buy -> live buy (any date) -> live sell flagged `live-sell` -> 0 flagged unpriced. Live is unconditional (unlike Overview) so old never-captured days keep billing as before; sell fallback beats billing 0 for thin compressed moon ore. `priceBasis.ts:125`, `20260926-142542`.
4. **How does Overview pick a price and what do the tags mean?** Per type per day: saved snapshot -> Adam4EVE -> ESI daily average -> live (only today/yesterday). Tag = weakest line source (saved < live < historical < average). "Now" bases use live only. `priceBasis.ts:69,140`, `20260922-210143`.
5. **Why does Overview keep 90 days when ESI gives 30, and what is lost?** The device merges each fetch into `db.miningLedgerHistory`; prune counts from the newest held day so a pause does not erase history; days before the first fetch after shipping are gone, so the Days-mined tile says "history starts". Tax does not use it. `ledgerHistory.ts:27`, `ledger.ts:44`, `20260922-204846`.
6. **What happens when more ore shows up on an already-assigned day?** Outstanding: silently absorbed and re-priced (also combined members). Paid/Dismissed: flips `needs-review` with a before/after diff; accepting reverts to outstanding (even from paid, clearing `paidAt`). Only strict growth counts. `reconcile.ts:88`, `needsReview.ts:15`, `assignments.ts:675`.
7. **Who gets new ore when one day has two Payees?** The growth collector: sole Assignment, else the one flagged `collectsGrowth`; unflagged legacy splits grow only into the sole claimant of a type, otherwise the ore sits Unassigned. `ownership.ts:60`.
8. **How does Settle up handle a partial or odd payment?** Oldest-first, whole entries only, stop at the first that does not fit, 0.5 ISK cumulative slack per entry for whole-ISK transfers, leftover reported. `settleAllocation.ts:27`.
9. **Why does Settle up never block on late ore?** ESI lags up to 1h and has no timestamps; the only signal is a total that grew between two fetches (stored with `grewAt`). 1h window, ticked entries only, recheck every 10 min. `oreArrival.ts:20,71`, `20261004-213852`.
10. **How are multi-record actions kept consistent across tabs/devices?** One Dexie transaction per action that re-reads inside it (`assertUnclaimed`, `undoContinue`, `deletePayee`), sync after commit, `AlreadyAssignedError` -> refresh. `ledgerActions.ts:100`, `assignments.ts:59`.
11. **How is refined value computed and where can it mislead?** Whole portions only, per-material floor, specialisation per line, implant only for ore-like types, an unpriced material makes it a floor (`Partial`); a type with no recipe also flips Partial when refining is on. Overview ISK/day uses RAW value only. `yieldValuation.ts:101`, `reprocessing.ts:68,108`, `OverviewTab.tsx:294`.
12. **Why ISK/day, not ISK/hour?** No intra-day timestamp to measure hours; per-day divides by distinct mined days (zero-mining days excluded). `yieldRate.ts:13`, `20260909-204328`, `20261006-085420`.
13. **What does flipping Ore Form do to existing bills?** Re-prices Unassigned and Outstanding; Paid/Dismissed/needs-review stay frozen; a record that cannot be priced is retried next load, never zeroed. The setting syncs. `oreFormReprice.ts:19`, `20261006-185915`.
14. **What does deleting a Payee do?** Optionally moves owed days plus whole combined entries to another Payee in one transaction; standalone paid days stay as history. `ledgerActions.ts:274-310`, `20261004-141751`.
15. **Why can an old owed bill disappear from the Tax tab?** Rows come only from the 30-day ESI ledger; balances are summed over rows, so an Assignment whose entry aged out stops showing and counting though it remains in Dexie. `snapshot.ts:122`, `balances.ts:36`, `ledger.ts:80`.

## 8. Observed gaps
- Tax rows come only from ESI's 30-day ledger (`snapshot.ts:122`); an owed Assignment older than 30 days vanishes from the table and from Owed balances (computed from rows, `balances.ts:36`) though it remains in Dexie. Overview's 90-day history is not used by Tax (`20260922-204846`: "The Tax tab is unchanged"). Verified contradiction: the comment at `reconcile.ts:76` ("aged out of ESI's 90-day retention") and the `MiningLedgerRow` doc in `src/esi/endpoints.ts:1478` ("90-day retention on ESI's side") say 90 days, but the ledger loader comment `ledger.ts:38-43` and `ledgerHistory.ts:3` say ESI returns only 30 days (the 90 is the device history cap). The behavior in code follows 30 (Tax uses the raw ledger); the two 90-day comments are stale/misleading.
- `/mining` gate lists only `getCharacterMining`; wallet journal/contracts reads for payment suggestions are ungated and fail silently with no in-page prompt (`madePayments.ts` header).
- Overview prefs are device-local (not synced, not in URL); only Character filter and sort are shareable.
- Tax CSV is a fixed 7-column set, no ore or payment-link data; Overview CSV exports every column.
- Ore column in the Tax table is hidden below 87.5rem; ore is visible only in detail there.
- No per-moon identity (ESI limit); same-system same-day separate moons rely on manual Split.
- Overview always prices at Jita and Tax at Payee hubs, so Overview ISK and Tax estimated value can differ for the same ore.
- ISK/day divisor excludes zero-mining days: a sporadic miner reads higher than a calendar-day rate.
- Accept new total on a Paid Assignment reverts it to outstanding and drops `paidAt`/`oreLineValues` (intentional but destroys the paid record).
- "Partial" on Overview is a tag only; no filter for unpriced rows.

## 9. Improvement ideas
- Fold the 90-day device history into Tax (read-only History) so aged-out paid/owed rows stay visible and balances do not drop them.
- Add an in-page "grant wallet/contracts to get payment suggestions" nudge on Settle up / Link payment.
- Sync Overview prefs (range, basis, buyback) via `createSyncedSetting`; put range/basis in the URL for shareable views.
- Offer a Tax CSV "full detail" variant (ore lines, payment refs, group id).
- Let Overview price at a chosen hub (or each Payee's hub) so Overview and Tax reconcile.
- Show a notice when an Assignment has no row because its entry left the ESI window.
- Keep a copy of the paid record before Accept new total reverts it, so the pilot can compare.
