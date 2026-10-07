# Entities (Show info) and Share Links

Two cross-cutting surfaces: (1) the `?info=` entity layer — clickable names that open Show Info (Public info modal, Skill Detail, Item Detail) over whatever page the pilot is on; (2) stored Share Links `/share/<id>` and the permanent Fitting Share Code URL. Neither is a nav destination. Terms per `CONTEXT.md`: Show Info, Item Detail, Fitting Share Code, Share Link, Shared Appraisal, Pilot Lookup. See also `docs/features/share-links.md` (page-by-page share flow), `docs/features/pilot-lookup.md`, `docs/features/assets.md` (Item Detail).

## Feature table

| Feature | URL / trigger | Code | Data source | Scope |
|---|---|---|---|---|
| `?info=character-<id>`, `corporation-<id>`, `alliance-<id>` -> Public info modal (tabs Character / Corporation / Alliance / Employment) | any page + query | `src/lib/entityInfo.ts`, `src/features/entities/EntityInfoRoute.tsx:28`, `src/components/PublicInfoModal.tsx:65` | ESI public (character, corporation, alliance, corp history, alliance history, alliance corporations), affiliation + names resolve, zKillboard | none |
| `?info=skill-<typeId>` -> Skill Detail modal | same | `src/components/SkillDetailModal.tsx:43` | SDE skill catalog; trained levels from the active Character's skills + queue | skills/queue are Core Grant; no extra |
| `?info=type-<typeId>` -> Item Detail (Show info) | same | `src/features/entities/ItemInfoModal.tsx:22`, hosts `src/features/market/ItemDetailModal` | SDE types + market prices (see market doc) | none |
| Entity links (`CharacterLink`, `CorporationLink`, `AllianceLink`, `SkillLink`, `ItemInfoLink`, `SystemLink`) | click, middle/Ctrl-click | `src/features/entities/EntityLink.tsx` | - | - |
| Stored Share Link `/share/<id>` (appraisal or fitting) | URL, no session needed | `src/routes/SharedLink.tsx:34`, `src/features/share/shareStore.ts`, `ShareShell.tsx:33` | Firestore `shares/{id}` | none |
| Fitting Share Code view `/share/fitting?f=<code>` (permanent) | URL | `src/routes/FittingShared.tsx:47,58` | code decoded client-side, SDE | none |
| Creating a link: "Copy Share Link" on Appraisal and on a Fitting's Export menu | button | `src/features/market/AppraisalPanel.tsx:201`, `src/features/fittings/useFittingExport.ts:72` | writes Firestore | needs a Character (Firebase session) |

## Entity links and the `?info=` URL

**Grammar.** `?info=<kind>-<id>` with kind in `character|corporation|alliance|skill|type`, id a positive safe integer (`src/lib/entityInfo.ts:20,27`); anything else is ignored (modal closed). The param rides the *current* location: `entityInfoHref` keeps pathname and every other param (`:37`). So a link is a real `<a href>`: middle-click and Ctrl/Cmd/Shift/Alt-click open a new tab with the modal open; plain click navigates in-app (`isPlainPrimaryClick`, `EntityLink.tsx:35`).

**History model** (`EntityInfoRoute.tsx`, mounted once in `src/app/App.tsx`):
- Opening pushes a history entry stamped `{entityInfo: true}` (`entityInfoState.ts:5`). Close = `navigate(-1)` when the entry was pushed here, so Back and the Close button agree.
- Opening while a modal is already open (character -> its corporation, drill-down) *replaces* instead of pushing (`EntityInfoRoute.tsx:41`, `EntityLink.tsx:45`), so a single Close/Back returns to the page.
- URL opened cold in a new tab (no marker): Close replaces the URL with the same location minus `info`, never leaving the app (`:55`).
- Changing pathname strips `info` (a tab switch keeps the search; the modals close on page change) (`EntityInfoRoute.tsx` effect on `location.pathname`; `PublicInfoModal.tsx` also clears on pathname change).
- The modals use `closeOnBack={false}` (`PublicInfoModal.tsx:168`, SkillDetailModal) because the route layer owns Back.
- `kind` switch: `type` -> `ItemInfoModal`, `skill` -> `SkillDetailModal`, other kinds -> `PublicInfoModal`; the other two stores are cleared each time so only one modal shows.
- Staging: `SkillLink` can pass `planEntries` (the open Skill Plan, so prerequisites already planned read "Planned") and `ItemInfoLink` passes the item name; both only on a plain click (not Ctrl/middle), consumed once; from a pasted URL the item name is looked up by type id (`ItemInfoModal.tsx`, falls back to "Type #{id}" if the lookup fails, `:42`).

**Defaults and overrides** (docs/DESIGN.md §6c "Entities"): item name -> Show info (`ItemInfoLink`) unless the page is market context (`MarketItemLink`); character/corp/alliance -> Public info; skill -> Skill modal; contract -> Contract modal; solar system -> `SystemLink` = Route Safety with that system as destination (`EntityLink.tsx:132`, uses `routeToHref`); station not clickable. Documented override: Planetary Industry item names open the PI product detail (`docs/context/decisions/20261005-212941-entity-link-destination-follows-the-page-pi-item.md`). Rows with their own primary action keep plain names; `src/features/entities/itemInfoLinkAllowlist.test.ts` fails when a new `ItemInfoLink` use is not reviewed (22 reviewed files, including asset rows, journal descriptions, materials table, order history, zKillboard stats section, Clones).

Why URL-backed: shareable/back-button-safe modals (`docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md` is the sibling rule for tabs; scope decisions `20260930-104922-public-infos-character-tab-is-pilot-lookups-view.md`).

## Public info modal (`src/components/PublicInfoModal.tsx`)

Title: the entity's name once loaded, else "Public info". Wide dialog. Tabs appear only when their kind has entered the chain (so an alliance-less pilot never gets an Alliance tab): Character, Corporation, Alliance, plus Employment for a real, found, non-NPC character (`:154-164`).
- **Open with a character id**: `loadPilotProfile` (`src/features/travel/pilotLookup.ts:79`) = public character info (cached static, 404 -> "not found", other failures -> error) joined with the *live* affiliation (affiliation wins over the cached corporation id, which can be stale); then corporation info, then alliance info load in sequence; corporation/alliance tab ids follow the live affiliation. **Corporation id / alliance id**: skip straight to that tab (alliance via the corp's `alliance_id`).
- **Character tab**: Pilot Lookup's `PilotProfileView` (identity, security status, zKillboard stats from `src/lib/zkillboard.ts`, top ships, recent kills and losses; stats cached 10 min, `PILOT_STATS_CACHE_MS`, failures never cached). NPC agent (CCP id block, `isNpcCharacterId`): slim card — portrait, "NPC agent", corporation button (switches to Corporation tab), faction, hint "An agent run by CCP, not a player. There's no killboard or employment history to show." (`NpcCharacterCard`, `:327`). Unknown character: "This character couldn't be found" / "EVE has no character with this id."
- **Corporation tab** (`src/features/character/PublicInfoCorporationTab.tsx`): logo, `[ticker]`, alliance (button -> Alliance tab; "since MMM YYYY" from alliance history), Player/NPC corporation, War eligible tag, zKillboard and Website external links; zKillboard Snuggly↔Dangerous / Solo↔Gang meters; tiles Members, Age (years/months), Tax (only if ESI states it), Kills, Losses, ISK destroyed (not for NPC corps); CEO and Founder (person links), Founded, Home station (name resolved), Faction, Shares; most-flown hulls; description (EVE markup, scrollable); alliance history timeline (each past alliance an `AllianceLink`, "ongoing" vs period). NPC corporation skips killboard and alliance history. Each part loads independently, so one failure never blanks the rest.
- **Alliance tab** (`PublicInfoAllianceTab.tsx`): logo, ticker, executor, founder, founding corporation, founded, faction; zKillboard meters and figures; tiles Corporations, Pilots (zKillboard's count — ESI has no alliance headcount), Age; "Member corporations (N)" list, each opening in the modal.
- **Employment tab** (`PublicInfoEmploymentTab.tsx`): corporation history (ESI public); empty: "No employment history" / "This character has no public corporation history to show."
- States: per-tab spinner while loading; error `EmptyState` "load failed"; `unknown` for a missing character. A new request restarts all three tab states (`useEffect` on `request`, `:87-142`).
- Scopes: none (all public ESI and zKillboard). Data source note: zKillboard is a third-party fetch from the browser (`https://zkillboard.com/api/...`, `src/lib/zkillboard.ts:216`).

## Skill Detail modal (`src/components/SkillDetailModal.tsx`)

Reads the SDE skill catalog and, if a Character is active, trained skills via `loadCorrectedSkills` with `skipQueueWithoutScope: true` (so a missing queue scope does not break it). Shows description, a facts line (group, rank, primary/secondary attributes), `SkillPriceSection` (price block; given the skill's `npcPrice`, `src/features/skills/SkillPriceSection.tsx`), and `SkillRequirementsList` (prerequisites trained vs still needed, "Planned" if in `planEntries`; what the skill unlocks). States: loading spinner; error with **Try again** (re-runs in place, `attempt` counter); "Skill not found" when the type is not in the catalog. With no active Character everything shows untrained.

## Item Detail host (`src/features/entities/ItemInfoModal.tsx`)

Mounted while `?info=type-<id>` is set; lazy-loads `ItemDetailModal` (guarded chunk). Supplies page-less Item Actions (`usePageItemActions`, `lazyBlueprints: true`) so "Used in" menus work with no page. Passes `showOpenInMarket`: header "Open in Market". Item Detail contents: see `docs/features/assets.md` ("Item Detail (Show info) as reached from Assets"); `market.md` only mentions it. The palette's Market items pick opens the same modal without a URL change (`src/features/commandPalette/CommandPaletteHost.tsx`).

## Stored Share Links

**Model** (`src/features/share/shareStore.ts`): top-level Firestore collection `shares`, doc id = 9 base-62 characters minted client-side with `crypto.getRandomValues` and rejection sampling (`src/engine/share/shareId.ts`, ~53 bits); fields `type`, `payload`, `createdAt` (server time), `expiresAt` = now + 7 days (`SHARE_TTL_MS`, `:23`). Types: `appraisal`, `fitting` (`SHARE_TYPES`, `:26`; mirrored in `firestore.rules`). The doc carries no uid or Character id: it never names the sharer.

**Rules** (`firestore.rules:243`): `get` allowed only while `expiresAt > request.time`; `list` denied; `create` needs any signed-in user, id matching `^[0-9A-Za-z]{9}$`, exactly the four keys, `type in ['appraisal','fitting']`, `payload is map`, `createdAt == request.time`, `expiresAt` in the future but under 8 days (a day of clock-skew allowance), appraisal `items` list at most 1000, fitting `code` string at most 20,100 chars; `update`/`delete` denied (create-only; a taken id is refused, not merged). Expired docs are deleted by a Firestore TTL policy on `expiresAt` (`firestore.indexes.json:452`), which can lag a day, so the client also checks expiry (`shareStore.ts:118`).

**Creating** (needs a Firebase session: `saveShare` calls `ensureAnySession(characterId)`, `shareStore.ts:45`):
- Appraisal: **Copy Share Link** in Market › Appraisal (`src/features/market/AppraisalPanel.tsx:201`). Builds `AppraisalSnapshot` (`src/engine/market/appraisalSnapshot.ts`: hub id, price percent, `generatedAt` epoch seconds, items with per-unit buy/sell at 100% and unit volume; empty -> not shareable; over 1000 items -> too large, "Too large to share as a link — use Export CSV instead."). Shows "Creating Share Link…", then copies and shows "Share Link copied — it works for 7 days"; failure "Couldn't create the Share Link. Try again."; when the browser refuses the clipboard write the link is shown on screen to copy by hand ("Share Link — works for 7 days" + Copy). Requires an active Character (`characterId === null` -> no-op).
- Fitting: **Copy Share Link** in the Fitting's Export menu (`src/features/fittings/useFittingExport.ts:72`). Wraps the Fitting Share Code; `fittingShareCode` null -> "Too large to share as a link."; no Character or sync not configured -> "Couldn't create the Share Link. Try again."; success "Share Link copied — it works for 7 days"; if the clipboard fails after saving: "Share Link ready — choose Copy Share Link again to copy it." The permanent code link is a separate item ("Permanent link copied").
- Reuse: the same content (`reuseKey`: the serialized snapshot / the code) shared again this session returns the same link with no await, so the copy stays inside the click; ignored when under 24 h to expiry (`REUSE_MARGIN_MS`, `:69`; in-memory only, resets on reload).

**Opening** (`src/routes/SharedLink.tsx:34`, route `src/app/App.tsx:370`, outside `RequireCharacter`/`ScopeGate`, asserted by `src/app/routeScopes.test.ts`): `loadShare(id)`; invalid id shape -> not-found; `permission-denied` and missing doc and expired -> `not-found` ("This link has expired" / "Shared links last 7 days. Ask whoever sent it to share it again."); any other Firestore error -> `failed` ("Couldn't load this link" / "Check your connection and try again."); unknown `type` (a newer build) -> `unsupported` ("This link needs a newer Neocom Desk" / "Reload the page to update, then open the link again."). While loading: spinner in `ShareShell` titled "Shared link". Dispatch by `type`:
- `appraisal`: Shared Appraisal (`src/features/market/AppraisalShareScreen.tsx`): frozen at the priced time — stat chips (hub system + "at N%", Sell total, Buy total, volume, Generated, Expires), a table of items (item, quantity, buy/sell each and totals, volume column hidden on phones), export menu; never re-priced; invalid payload -> "This link isn't valid" / "The link may be corrupted or incomplete."; empty rows -> appraisal "no matches". **Open Neocom Desk** carries it into the live Appraisal tab (`sharedAppraisalOpenInApp`).
- `fitting`: `FittingShareView` with `expiresAt`.

**ShareShell** (`ShareShell.tsx:33`): no navigation chrome; brand, title, optional actions, content, and one button "Open Neocom Desk". Signed out (`characterCount === 0`): goes to `/login` and stashes the target with `setLoginReturnTo` so the SSO callback lands on it; while the count is still loading it goes straight to the target but still stashes it; signed in: plain link to the target path with its router state. A dead link has no target (plain `/`).

**Fitting Share Code view** (`src/routes/FittingShared.tsx:58`, route `/share/fitting?f=`): signed-in visitors never see it — `<Navigate>` into the editor on the same code (`:146`). Signed out: warning banner "Shown at every skill level V, with no clone — log in to see this fit under your own pilot."; optional "This link expires …" for a Share Link; states loading / invalid or unsupported-version ("This link isn't valid … or built by a newer version of Neocom Desk") / failed ("Could not load this fitting"); ready: ship icon and name (+ fit name if different), `FittingRing`, `FittingStatsSections` (EHP etc. under the viewer's own Damage Profile, local-then-synced), Abyssal weather picker, module list; buttons **Open in Neocom Desk** (primary, `/login` with return to the editor location) and **Copy Fitting** (EFT text; "Copied" / "Couldn't copy" for 2 s). The permanent `/share/fitting?f=` code never expires; the old `/fittings?f=` URL redirects (`LegacyShipsRedirect`) but only inside the signed-in shell (see gaps).

## Tests

`src/features/share/shareStore.test.ts`, `src/features/entities/EntityInfoRoute.test.tsx`, `EntityInfoOverModal.test.tsx`, `ItemInfoLink.test.tsx`, `ItemInfoModal.test.tsx`, `itemInfoLinkAllowlist.test.ts`, `src/components/PublicInfoModal.test.tsx`, `SkillDetailModal.test.tsx`, `src/routes/SharedLink.test.tsx`, `FittingShared.test.tsx`, `src/app/routeScopes.test.ts` (share-route exemption). Assertions beyond what the code comments state were not read.

## Related docs

Corporation pages that open Show Info links (`CorpRoster`, `CorpTransactionsPanel`): `docs/features/corp.md`; Item Detail: `docs/features/assets.md`; Pilot Lookup (same profile view as the Character tab): `docs/features/pilot-lookup.md`; share creation UX: `docs/features/share-links.md`. Shell-side hooks (where the modals are mounted and what closes them): `docs/features/app-shell.md`.

## Observed gaps

- Old permanent Fitting Share Code URLs `/fittings?f=<code>` redirect via `/fittings/*` -> `LegacyShipsRedirect` (`src/app/App.tsx:175`), a route inside `RequireCharacter`; a signed-out visitor is sent to `/login` and `Login` never reads `state.from`, so the code is lost. Only `/share/fitting?f=` and `/share/<id>` open with no session.

- `loadShare` returns `not-found` for a missing id as well as an expired one, and the UI words both "This link has expired" (`src/features/share/shareStore.ts:118-127`, string `share.goneTitle`); a mistyped id reads as expired.
- Share creation silently does nothing for Appraisal when no Character is active (`handleShare` early return, `src/features/market/AppraisalPanel.tsx:190`); the Share button is disabled when `!isSyncConfigured()` (`:591`), while the Fitting path instead shows "Couldn't create the Share Link" (`useFittingExport.ts:72-76`).
- A Share Link cannot be revoked or extended: rules deny update/delete, TTL fixed 7 days (`firestore.rules:243`); reuse state is in memory only, so after a reload the same content mints a new doc.
- The FAQ's "What We Store" does not list Share Links, though each stores the appraisal's items/prices or the fitting code in a public-by-id Firestore doc (`src/features/faq/whatWeStore.ts`).
- zKillboard calls are made directly from the browser to `zkillboard.com` (`src/lib/zkillboard.ts`); a zKillboard outage degrades the Character/Corporation/Alliance stats to a note while ESI parts still render.
- `?info=` opened cold with an unknown/invalid id shape is silently ignored (`src/lib/entityInfo.ts:27`), no error state.
- Item name fallback "Type #{id}" is hardcoded English in code (`ItemInfoModal.tsx:42`), not an i18n key.

## Interview Q&A

1. **Why is a click on a corp name a URL change, not component state?** So middle-click/new-tab/copy-link work and Back closes the modal with no extra code (`src/features/entities/EntityInfoRoute.tsx:28` header; DESIGN.md §6c "Real links").
2. **How does Close avoid leaving the app on a cold link?** Entries pushed by the app carry `{entityInfo:true}`; absent marker -> replace with the same URL minus `info` (`EntityInfoRoute.tsx:55`, `entityInfoState.ts:5`).
3. **Why drill-down replaces history?** One Back/Close must return to the page, not walk back through character -> corp -> alliance (`EntityInfoRoute.tsx:41`, `EntityLink.tsx:45`).
4. **What does a pilot see for an NPC agent?** A slim card, no killboard/employment (`PublicInfoModal.tsx:154,327`).
5. **Why is the corporation tab driven by live affiliation, not the cached record?** The cached public character info is static; affiliation moves (`src/features/travel/pilotLookup.ts:79`).
6. **What scopes does Show Info need?** None; all ESI public and zKillboard. Skill Detail reads the active Character's skills only if granted and skips the queue when its scope is missing (`SkillDetailModal.tsx`, `skipQueueWithoutScope`).
7. **How long does a Share Link live and who can read it?** 7 days from creation, not extended by opening; anyone with the id can read all of it; no uid stored (`shareStore.ts:23`, `firestore.rules:243`).
8. **Can someone enumerate links?** `list` is denied, ids are 9 base-62 chars (~53 bits) (`firestore.rules:243`, `src/engine/share/shareId.ts`).
9. **Appraisal limits?** 1000 items (client `MAX_SNAPSHOT_ITEMS` and rule); empty is not shareable (`src/engine/market/appraisalSnapshot.ts:18`).
10. **Fitting code limits?** 20,100 chars (`src/engine/fitting/fittingSharePayload.ts:15`, rule); over -> "Too large to share as a link."
11. **What does a logged-in visitor of a fitting link see?** The editor on that code, under their own pilot; the All-V view is only for signed-out visitors (`FittingShared.tsx:146`).
12. **How does "Open Neocom Desk" survive login?** `setLoginReturnTo(target.path)` stashed before `/login`; the callback consumes it (`ShareShell.tsx:33`, `src/routes/Callback.tsx` `takeLoginReturnTo`).
13. **Why can the same content produce the same link?** Session reuse map keyed by `type + reuseKey`, unless under 24 h from expiry (`shareStore.ts:69,89`).
14. **Why is the item name link sometimes not a link?** Rows with their own primary action keep plain names; allowlist test enforces review (`src/features/entities/itemInfoLinkAllowlist.test.ts`; DESIGN.md §6c).
15. **What happens opening a link from a newer build?** `unsupported` state telling the visitor to reload (`src/routes/SharedLink.tsx`, `shareStore.ts:134`).

## Improvement ideas

- Distinct "never existed" vs "expired" wording for share ids, or store expired metadata long enough to tell.
- A "Manage my links" list with revoke (needs create-time owner field and rules change — currently deliberately anonymous).
- Show the Share Link size/expiry on the Appraisal and Export menus; persist reuse across reloads.
- Mention Share Links and analytics in the FAQ's What We Store.
- Show an error banner for an invalid `?info=` instead of ignoring it.
- Move the `Type #{id}` fallback to i18n.
