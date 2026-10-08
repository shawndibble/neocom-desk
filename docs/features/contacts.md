# Contacts

`/contacts` (This character) and `/contacts/across` (All characters). Nav: Social group, scope-gated, phone tab, `tablessNav` (the nav and command palette list the page only; the two views are one in-page control). Read-only view of the in-game contact list with standings, affiliation, labels, blocked/watched flags, plus a cross-Character comparison. No add/edit/delete contact, no standings editing.

User goal: "who do I have standing with, who is blocked/watched, and do my alts agree?"

Code: `src/routes/Contacts.tsx`, `src/routes/contactsColumns.ts`, `src/features/character/{contacts,contactsFilter,contactsAcrossCharacters,contactStandings,contactAffiliation,contactsCsv,CharacterFilterControl,characterFilterUrlParam,StandingTag}.ts(x)`, `src/components/ui/{StandingIcon,standingTier}.ts(x)`, `src/app/pageTabs.ts:23` (`CONTACTS_TABS`: `character`, `across`, `standings`).

## Summary

| Feature              | What                                                                                                 | Where                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| This character table | Portrait, Name (+NPC badge, flags on phone), optional Type / Affiliation / Labels / Standing / Flags | `Contacts.tsx:~860-990`                  |
| All characters table | Merged contacts across every Character on the device: Name, Type, Held by (n of N), Standings        | `AcrossCharactersPanel` `:535`           |
| View switch          | `CharacterFilterControl` in header, only when > 1 Character                                          | `Contacts.tsx:1082`                      |
| Search               | Name or numeric id substring, URL `q`                                                                | `filterContacts`                         |
| Type chips           | Character, NPC, Corp, Alliance, Faction with counts                                                  | `ContactsFilterBar` `:356`               |
| Standing chips       | Good / Neutral / Bad with counts (This character only in effect)                                     | same                                     |
| Only disagreements   | Across view chip with count, URL `across.disagree`                                                   | same                                     |
| Column picker        | Per-view optional columns, device-local, Reset                                                       | `ColumnPickerMenu`, `contactsColumns.ts` |
| Sort                 | Header sort, URL `sort` (this) / `across.sort` (across)                                              | `useUrlSort`                             |
| Fetch all characters | Button on Across view: live refetch of each Character's contacts                                     | `:577`                                   |
| Row click            | Opens Public Info modal (character/corp/alliance); faction unclickable                               | `onRowClick`                             |
| CSV export           | Visible rows of the active view; `-partial` suffix when truncated                                    | `contactsCsv.ts`                         |
| Refresh + Data Age   | Header                                                                                               | `Contacts.tsx:1077,1104`                 |
| Reauth banner        | Contacts scope missing/revoked                                                                       | `GrantBanner`                            |

## Routing and view selection

- `/contacts` -> This character; `/contacts/across` -> All characters. Registered via `CONTACTS_TABS` (ADR 0015 path-segment tabs). The switch maps `current`/`all` onto the path (`setTab`), no `chars` param (decision `20261002-145207-contacts-rows-open-show-info-npcs-by-id`).
- View is `across` only if `tab === 'across'` and (data not loaded yet or more than one Character) (`Contacts.tsx:1001`). With one Character `/contacts/across` silently renders This character, and the switch is not shown (decision `20260912-211914-across-characters-reads-cached-contacts-and-fetches-on`).
- Scope gate: `routeScopes.ts:269`, endpoints `getCharacterContacts`, `getCharacterContactLabels`, `postUniverseNames`; strings `contacts`.

## NPC standings (Standings tab)

`/contacts/standings` lists the Character's NPC faction, corp and agent standings (`ContactsStandings.tsx`, rows from `features/character/npcStandingsRows.ts`): name, kind, standing with the tier icon, and a "Used for fees" marker on the Trade Hub owner corps and factions the broker-fee path applies (#2859). Other NPC stations use their own owner and agents never count; refine/reprocessing applies no standing. A missing standings scope shows a `GrantBanner` in the tab, not an empty table. Skill-adjusted effective standing is not shown. Standings to a contact are the contact's own number, not these.

## States

- Not hydrated: spinner. No active Character: redirect `/characters`.
- Loading with no data: spinner (filter bar waits for first good counts).
- Across view renders regardless of This-character errors; This character view order of checks: reauth (`GrantBanner` for `getCharacterContacts`), error (`EmptyState` load failed), empty (`CachedEmptyState`: "no contacts cached" offline vs "No contacts" after a successful empty fetch), then table.
- Served from cache: amber "offline" line. Paginated fetch cut short: amber "incomplete" line (`contactsTruncated`), CSV filename gets `-partial`.
- Filters empty the list: `noResults` with "Reset filters" button when any filter is active.
- Across view: empty (no contact anywhere) `acrossEmptyTitle/Hint`; no rows after filters `acrossNoResults`; until "Fetch all" is pressed a hint says data is "what each character last cached... may look emptier than it is".
- Filter chip counts use `lastGoodCounts`: kept through a manual refresh and while reauth, reset when the active Character changes (tests `:528`, `:555`). Counts are the active Character's contacts even on the Across view.

## This character table

- Default sort: Standing descending (`CHARACTER_SORT`, `:491`). Sortable ids: `name` plus optional column ids; invalid URL sort falls back (test `:778`).
- Columns: portrait (24 px; faction gets a faction glyph), Name (truncated; "NPC" badge; on phone blocked/watched icons inline when Flags column is on), then optional: Type, Affiliation, Labels, Standing, Flags (`CONTACTS_CHARACTER_COLUMN_IDS`). Labels is offered only if the Character has any contact labels. Visibility in Dexie setting `contactsCharacterVisibleColumns`; Name never hideable.
- Type labels: Character / Corporation / Alliance / Faction; NPC variants "NPC agent" / "NPC corporation" (`contactTypeLabelKey`).
- Affiliation: for player contacts, corp (and alliance, dimmed) from public affiliation lookup; a corp icon marks "your corporation / alliance"; if that corp/alliance is itself one of your contacts, its standing icon is prefixed ("also via"). Corp/alliance/faction/NPC rows show an em dash (they are their own affiliation).
- Standing: `StandingIcon` coloured tag with the number in the accessible name. Tiers: > 5 excellent, > 0 good, 0 neutral, >= -5 bad, < -5 terrible (`standingTier.ts:17`). Filter categories are coarser: > 0 good, < 0 bad, 0 neutral (`contactsFilter.ts:94`).
- Flags: blocked (danger icon) and watched (warning icon) with tooltip; hidden from the table on phone (`max-sm:hidden`) and shown inline on the name instead.
- Labels: names from `/contacts/labels`, comma list truncated to 14rem with tooltip; sorts by first label.
- Rows: stack into cards on phone (`stackLayout="dense"`, `mobileSort` sort control); standing is the card corner. Row click opens the Public Info modal (character, corporation, alliance); faction rows get `cursor-default` (no faction endpoint).
- No row menu or More button by design (test `:514`; note decision `20261002-145207` first bullet says the menu keeps an entry, but the shipped code and test have none).

## All characters table

- Rows = union of contacts keyed `type:id` across every stored Character (ordered by `addedAt`). Held by = count "n of N" with a tooltip listing holders and missing Characters; text turns warning when any are missing; sortable by count. Standings = the distinct standing values given by holders, sorted ascending, as icons (never averaged; sort uses the lowest). Default sort `held` ascending (least agreed first). Optional columns: Type, Held, Standings (`contactsAcrossColumnsStore`, key `contactsAcrossVisibleColumns`).
- `disagrees = lists.length > 1 && (missing.length > 0 || distinct standings > 1)` (`contactsAcrossCharacters.ts:89`). "Only disagreements" narrows to those; its chip carries the count.
- Search matches the resolved name only here (not the id). Type chips apply. Standing chips are rendered but ignored (see gaps).
- Data: cache-only by default (`readCachedRows(..., 'contacts')`); "Fetch all characters" runs `loadContactsAcrossCharacters({live:true})` with `ESI_FANOUT_CONCURRENCY`, errors per Character swallowed (that list stays empty). Per-Character `truncated` bubbles up to the `-partial` export marker.
- Row click opens Public Info like the other view.

## Data sources and scopes

| Data                          | Endpoint                               | Scope                              | Notes                                                                                                 |
| ----------------------------- | -------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Contacts (paginated)          | `GET /characters/{id}/contacts`        | `esi-characters.read_contacts.v1`  | conditional paged fetch; `truncated` flag                                                             |
| Labels                        | `GET /characters/{id}/contacts/labels` | same                               | errors swallowed -> no Labels column                                                                  |
| Names                         | `POST /universe/names`                 | public                             | all contacts, affiliations, across contacts                                                           |
| Affiliations                  | `POST /characters/affiliation`         | public                             | player contacts + self                                                                                |
| Standings (NPC faction/agent) | `GET /characters/{id}/standings/`      | `esi-characters.read_standings.v1` | not on this page; used for broker fees (`features/character/standings.ts`) and `StandingsScopeNotice` |
| Portraits/logos               | EVE image server                       | public                             | lazy                                                                                                  |

Missing contacts scope -> `GrantBanner` asking only that Permission (characterDetails group). Across view still shows other Characters' cached lists. Standings scope missing never blocks this page.

## Persistence

URL: `q`, `types`, `standing`, `across.disagree`, `sort`, `across.sort`, path (ADR 0015). Dexie settings: `contactsCharacterVisibleColumns`, `contactsAcrossVisibleColumns`. Cache rows `contacts`, `contactLabels`, `affiliation:*`. Nothing synced; contacts are never written back to ESI.

## NPC detection

Character id 3,000,000-3,999,999 and corporation id 1,000,000-1,999,999 are NPC (`esi/entityIds.ts:9-15`), by id not by employment; the NPC chip is separate from Character/Corporation chips (`ALL_CONTACT_KINDS` order: character, npc, corporation, alliance, faction).

## CSV

`useTableExport` surfaces `contacts` and `contacts-across`. This character columns: Name, Type, Affiliation (corp only), Standing (raw number), Blocked, Watched (Yes/No). Rows = filtered visible rows. Across: Name, Type, held count, standings joined by ", ". Header-only file when empty (tests `:614-725`).

## Test-covered behaviours (`src/routes/Contacts.test.tsx`)

Listing/flags (:167), type naming (:180), phone cards (:193), affiliation/own corp/also-via (:203-240), standing/type/search filters and counts (:242-326), single-character no switch (:327), tab paths and reload restore (:334-362), held counts, missing on focus, disagreements only, sheet cancel, multi standings, cached hint (:364-458), offline/empty/reauth (:460-490), Public Info click (:492), no row menu (:514), counts kept through refresh and reset per character (:528-555), exports incl. `-partial` (:614-725), tier tags (:725-745), URL restore of search/sort (:748-785).

## Interview Q&A

1. **Why doesn't the across view fetch automatically?** Opening it would cost a paginated contacts fetch per alt against the ESI error budget; it reads cached lists and offers "Fetch all characters" (decision `20260912-211914`, `contactsAcrossCharacters.ts:137`).
2. **Why show every standing and not an average?** +10 and -10 have no midpoint; the row's purpose is to display disagreement (same decision; `standings` sorted distinct values, `:88`).
3. **How is "disagrees" defined and when is it always false?** Missing from at least one list or more than one distinct standing, and only with > 1 list (`contactsAcrossCharacters.ts:89`).
4. **Why do two different standing scales exist?** Icons use 5 tiers around 0/5 (`standingTier.ts`), mirroring EVE's colour tags; filter chips use sign only (`contactsFilter.ts:94`).
5. **How does the page tell NPC from player?** Id blocks (`entityIds.ts`), not affiliation, so it works offline and for unresolved names (decision `20261002-145207`).
6. **What is "also via" in Affiliation?** `effectiveStanding` on the contact's corp/alliance among your own contacts (precedence character > corp > alliance > faction): a pilot you did not rate individually but whose corp you did (`contactAffiliation.ts`, `contactStandings.ts:28,85`).
7. **Why do the filter counts persist during refresh?** A refresh momentarily yields no data; `lastGoodCounts` keeps chips mounted (no layout jump) and is cleared on Character switch so counts never leak (`Contacts.tsx:809-816`, tests `:528`, `:555`).
8. **What happens with one Character and `/contacts/across`?** Falls back to This character; no switch (`:1001`, `:1082`).
9. **Why is the page not tabbed in nav?** `tablessNav`: the two views are state behind `CharacterFilterControl`; palette and rail list the page once (`navDestinations.ts:73-80`).
10. **What does a truncated list mean for export?** `truncated` from the paged loader flags an incomplete fetch; both views export with `-partial` and show an "incomplete" notice (`Contacts.tsx` export setup, test `:644`, `:686`).
11. **Who uses contacts besides this page?** Mail standing tags and forward quick-picks, Contracts counterparty tags, command palette Contacts group (cache-only), see `mail.md`, `command-palette.md`.

## Observed gaps

- Standing chips are shown and counted on the Across view but have no effect there (`AcrossCharactersPanel` filters on `types` and `text` only); chip counts and Type counts come from the active Character, not the merged set.
- Across search matches names only (This character also matches numeric id).
- Contacts cannot be edited, added, blocked or relabelled; contact labels and watch/block flags are display only. No filter by label or by blocked/watched.
- Contact names unresolved fall back to `#id` (no retry UI).
- Decision `20261002-145207` says the row menu keeps its Show Info entry, but code/tests ship no row menu.
- Faction contacts are not clickable (no public faction endpoint).
- Standings page for NPC faction/agent/corp standings does not exist; `getCharacterStandings` only feeds broker-fee maths.
- The command palette `Contacts` group and `/contacts/across` are separate: no palette entry for the across view.
- FAQ/Help panels do not mention Contacts.

## Improvement ideas

- Filter by label, blocked/watched; show contact label chips.
- Make standing chips on Across meaningful (e.g. "any holder rates bad") or hide them there.
- Standings view (faction/NPC corp/agent) with broker-fee impact.
- Per-Character freshness on the Across view (show how old each cached list is) and a per-row "fetch this Character".
- Contact write-back (add/edit standing) would need `esi-characters.write_contacts.v1`, currently not requested.
