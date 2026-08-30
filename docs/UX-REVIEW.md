# UX Review — new-EVE-player walkthrough (2026-08-29)

Persona: knows EVE basics, never used third-party tools. Real character (Mero Otichoda, 82.6M SP), live dev build at `/neocom-desk/`, desktop 1400x900 + mobile 390x844. Screenshots in review scratchpad (`ux/*.png`, filenames referenced below).

## Summary verdict

Core loops work end-to-end: SSO re-auth, skill plan → computed queue → export, EFT fit → skill plan, build plan with live prices and a plain-language build-vs-buy verdict. Visual system is consistent, dense, legible, and holds up at mobile width. The blockers are trust and vocabulary: unresolved `Type #NNNN` names across Orders/Assets/Transactions make market views look broken; the remap optimizer prints contradictory numbers (total > current, "Savings: 0m"); and every optimizer/industry term (remap, segment, ME/TE, EIV) is dropped on the new player unexplained. Mobile hides six of ten sections outright. Fix naming, the optimizer readout, and the "reconnect" dead end and this is genuinely usable by a week-old player.

---

## 1. First-run comprehension

- **[confusing / med]** Cold start is a bare full-screen spinner on `bg` with no logo or text (`01-landing.png`); with a locked/failed IndexedDB it spins forever with no error. Fix: add wordmark + "Loading character data…" line under the `Spinner` in the app-boot gate, and a danger `EmptyState` after a timeout.
- **[good]** Landing on Characters with portrait card, corp/alliance; nav labels (Characters/Overview/Skills/Industry + Character section) map cleanly to EVE concepts (`01b-landing-loaded.png`).
- **[lacking / low]** Nothing in-app says what the tool _is_ (the manifest tagline "character, skill planning, and industry companion" never appears). Fix: reuse `app.tagline` as a `text-dim` line under the Characters page title, and in the logged-out `EmptyState`.
- **[confusing / med]** Red dot beside the wordmark is hover-only (`SyncStatusDot` title). A new player reads "red = broken" with no visible words and no action. Fix: on `error`/`offline` states render the label text next to the dot (11px chip), not tooltip-only.

## 2. Re-login flow (new industry-jobs scope)

- **[confusing / high]** `/industry` empty state says "Reconnect to fetch this character's running industry jobs" but offers **no reconnect affordance** — only REFRESH, which silently does nothing when the scope is missing (`02-industry-before.png`, `03-industry-after-refresh.png`). The user must guess Characters → Add Character. Fix: give that `EmptyState` an action button ("Log in again with EVE") wired to the same `loginFlow` as Add Character; make a scope-missing REFRESH surface a warning toast instead of no-op.
- **[good]** SSO itself is low-friction: character select → authorize; consent screen cleanly separates "Required scopes" (the new jobs scope) from "Scopes already granted" (`04-sso-screen.png`, CCP's screen). No password prompt with an active SSO session.
- **[confusing / low]** After authorizing you land on `/characters` with no confirmation and not back on Industry where you started (`s2c` log). Fix: store the origin route before redirect (loginFlow state param) and return to it; toast "Character reconnected".
- **[good]** After re-auth, jobs panel populates immediately with `DataAgeBadge` "just now" and an honest "no jobs running" empty state (`08-industry-jobs-after-relogin.png`).

## 3. Skill planning

- **[confusing / low]** NEW PLAN silently creates "Untitled plan"; rename is a native `prompt()` dialog — jarring against the Photon UI (`11-new-plan-dialog.png`). Fix: inline-editable name field in the plan row (click-to-edit input, `panel-2` fill).
- **[good]** Skill picker: search → pick Level I–V buttons; entries list with level numerals and REMOVE (`14-skill-search.png`, `16-entries-added.png`).
- **[confusing / med]** Entries the character already trained (Caldari Cruiser III on an 82M SP char) vanish from the computed queue while its empty state still says "ADD A SKILL TO SEE THE TRAINING QUEUE" — with 4 entries present (`15-skill-added.png`). Fix: computed-queue empty state variant "All entries already trained"; render trained entries in the entry list with a dim "trained" chip.
- **[good]** Computed queue itself is the best panel in the app: auto-injected prereqs italic + `PREREQ` badge, per-skill and cumulative time columns, total in the panel header (`17-computed-queue.png`). Add 11px column headers ("per skill / total") so the two time columns are self-explanatory.
- **[confusing / high]** Optimizer output contradicts itself: with Remaps=2, Segment 1 26d19h + Segment 2 9d16h = "Total time: 36d 12h" vs "Current attributes: 27d 18h", yet "Savings: 0m" (`19-optimize-remaps2.png`). Either the segment math ignores implants/omits something or the labels lie; a new player loses all trust here. Fix: verify `optimizer` engine segment durations against the computed queue, and render one sentence verdict: "Remapping saves you X" / "No remap improves this plan — keeping current attributes."
- **[confusing / med]** Remap segments are raw stat dumps ("INT 17 · MEM 17 · PER 27 · WIL 21 · CHA 17") with no instruction (`18/19-*.png`). Fix: per segment, one line: "Before skill N, remap to PER 27 / WIL 21 (in-game: Character Sheet → Attributes)"; mark the remap point inside the computed queue with a hairline divider row.
- **[confusing / med]** Toolbar has a bare `Remaps [0]` number input — nothing says "how many attribute remaps the optimizer may place" (`23-export-clicked.png` top right of toolbar). Fix: label it "Remaps available" with a `title` explaining the in-game yearly remap.
- **[lacking / med]** SUGGEST REORDER shows only the reordered list + ACCEPT/REJECT — no time delta, and when order is unchanged it doesn't say "no improvement" (`20-suggest-reorder.png`). Fix: header line "Reorder saves 0m — plan already optimal", disable ACCEPT when delta is zero.
- **[lacking / low]** What-if implants (+5 dropped total 27d18h → 25d18h, `21-whatif-plus5.png`) works but shows no before/after; Booster reveals unlabeled `Bonus [3]` (units? attribute points?) (`22-booster.png`). Fix: "vs current: −2d 0h" chip next to the computed-queue total whenever what-if/booster diverges from reality; label "Bonus (attribute points)".
- **[overwhelming / med]** On the Plans tab the full 40-row current skill queue sits above the plan editor; after selecting a plan you edit below the fold (`23-export-clipboard.png`). Fix: collapse "Current skill queue" to its header + total by default on `/skills/plans` when a plan is selected (Panel with expand action).

## 4. Clipboard round-trips

- **[good]** Export: exact in-game format incl. injected prereqs ("Large Energy Turret IV…" one per line, s4 log); button self-confirms by swapping to "COPIED TO CLIPBOARD" (`23-export-clicked.png`).
- **[good]** Import dialog: paste box states both accepted formats, auto-detects ("Detected: skill plan" / "Detected: EFT fit"), previews, and reports per-line errors readably ("Line 3: Bogus Skill IV — unknown skill: Bogus Skill") (`25-import-skillplan-preview.png`).
- **[good]** EFT round trip: hand-written Rifter fit parsed to a sensible skill list (Minmatar Frigate, Small Projectile Turret V, Small Autocannon Specialization…) (`26-import-eft-preview.png`).
- **[confusing / med]** EFT warnings are raw and duplicated: "Unknown item: Republic Fleet EMP S" three times (once per turret line) because faction ammo isn't in the SDE snapshot. Fix: dedupe warnings with a ×N count in the dialog; widen the SDE type snapshot to cover charges (same root cause as §5 naming).
- **[lacking / med]** Preview doesn't distinguish already-trained skills, and APPLY appends into the open plan with no summary — after apply my "cruiser" plan had 17 mixed entries (`27-after-eft-apply.png`). Fix: in preview, dim + tag "already trained" rows (reuse PREREQ badge styling); after apply, toast "Added 13 skills"; offer "New plan from fit" as the primary action.

## 5. Market / transactions

- **[confusing / high]** Unresolved names everywhere money matters: **all 13 open orders** render as `Type #33573`-style rows (`30-orders.png`), transactions show `Type #55329`, `Type #8433` (`29-wallet-transactions.png`), assets show `Type #4435` plus container groups headed `ITEM #1014427197525` (`36-assets.png`). A new player cannot tell what they own or sold; the app looks broken. Fix: extend the SDE type-name snapshot to all market/asset types (or lazy-resolve via `/universe/names/`), and for asset containers resolve the container's own type ("Drake #…") instead of the raw item id.
- **[lacking / med]** Transactions: Buy/Sell only as a text column; totals unsigned and uncolored, so spend vs income doesn't scan (`29-wallet-transactions.png`). DESIGN.md mandates sign + `isk-pos`/`isk-neg`. Fix: render TOTAL as `−11,724,000` red for buys / `+9,898` green for sells in `DataTable` cells (journal already does this correctly — copy it).
- **[good]** Journal: signed, colored amounts + running balance column — exactly right (`40-wallet-journal.png`).
- **[lacking / med]** Journal TYPE column leaks raw ESI ref types (`contract_price_payment_corp`, `bounty_prizes`) and some rows have "-" descriptions (`40-wallet-journal.png`). Fix: i18n map for the ~30 common ref types ("Bounty prizes", "Contract payment (corp)"); fall back to de-snake-cased text.
- **[good]** Data age: every ESI panel carries the dot + "just now" badge; balance formatted `263,573,216.04 ISK` (`28-wallet.png`).
- **[lacking / low]** Orders/transactions lack a location column and orders lack total-value; minor for the persona, note for later.

## 6. Crafting (build plans)

- **[good]** Flow: New plan → product search ("Rifter #691") → complete plan with materials table, fee breakdown, and a plain-language amber verdict "BUY is cheaper by 173,157 ISK" (`33-buildplan-rifter.png`). Verdict line is exactly the right altitude for a newbie.
- **[confusing / med]** Chip wall jargon: ME, TE, EIV, COST INDEX, SCC SURCHARGE, ISK/HOUR — zero explanation (`33-buildplan-rifter.png`). Fix: `title` tooltips on each StatChip label (one sentence each) and group the RESULTS strip into two labeled rows: "Costs" / "Sale".
- **[confusing / med]** Switching Trade hub also silently changes the build system's cost index (Jita 16.86% → Amarr 8.25%, `34-buildplan-amarr.png`) — "where I buy" and "where I build" are conflated with no hint. Fix: caption under the Trade hub select: "Prices and system cost index use this station's system", or split "Build system" out when facility ≠ NPC station.
- **[good]** Facility preset changes behave sensibly (Raitaru: facility tax 0, time 1h17m → 1h5m, extra "Facility tax %" field) (`35-buildplan-raitaru.png`).
- **[lacking / low]** Owned-blueprint awareness (roadmap feature) never surfaces — plan doesn't say whether the character owns a Rifter Blueprint or at what ME. Fix: chip in the plan header ("Owned BPO: ME 10") once blueprint data is wired to the plan.
- **[good]** Jobs panel: clear empty state, refresh + data age (`08-industry-jobs-after-relogin.png`); see §2 for the scope-missing state.

## 7. Ship fitting expectations

- **[lacking / med]** Persona goal "fit a ship" hits a wall: no Fitting nav item, no mention anywhere that fitting isn't a feature; the only fit-related capability (EFT import) hides inside Skills → Plans → Import from clipboard. Fix: don't build a fitter (right scope call per competitors research) — add a small "Fittings?" pointer: on the import dialog title mention "from pyfa / in-game fitting window", and add one Overview/Characters help line: "NeoCom doesn't simulate fits — paste any EFT fit into a Skill Plan to see what you need to train." That converts the gap into the app's differentiator.

## 8. General

- **[good]** Mobile 390x844: no horizontal page scroll on Plans/Wallet/Industry; forms reflow to 2-col; bottom tab bar appears (`37-mobile-*.png`).
- **[lacking / high]** Mobile bottom bar has only Characters/Overview/Skills/Industry + avatar (`Layout.tsx:134`); Wallet, Assets, Mail, Calendar, Contracts, Orders are **unreachable on mobile** — no overflow menu. Fix: replace the avatar slot with a "More" sheet listing the six character views (avatar moves inside it).
- **[lacking / med]** Keyboard: focus order and visible rings are fine; entry drag handles are focusable buttons ("Reorder X") but have no key handler — reorder is mouse-only (`EntryList.tsx`). Fix: ArrowUp/ArrowDown moves the focused entry (roving handle), announce via `aria-live`.
- **[good]** Dark theme legibility: dense tables, dim labels, tabular numerals all read cleanly at both widths; matches DESIGN.md tokens throughout.
- **[lacking / low]** PWA: manifest + workbox + ReloadPrompt are configured (`vite.config.ts`) but no SW/manifest in dev, so install prompt is unverifiable here; no in-app "Install" affordance exists. Verify on the GH Pages build; consider a one-time install hint chip.
- **[lacking / med]** Offline: with the network down, REFRESH on Wallet fails silently — no toast, data-age badge unchanged (`39-offline-refresh.png`). Fix: failed manual refresh must toast "Offline — showing cached data (2m old)"; the sync dot's offline state should also gain visible text (§1).
- **[good]** Real data sanity: SP total 82,616,083 plausible; attributes show implant bonuses ("42 + 4 = 46"); implants render as names not ids; wallet/ISK formatted; queue times consistent (`09-skills.png`, `36-overview.png`). Exceptions are the type-name gaps (§5) and Overview's training line missing the level numeral ("Training Caldari Drone Specialization" — should be "… IV") **[lacking / low]**.
- **[overwhelming / low]** Skills → Trained is one ~9,800px page of every skill group with no search/filter or group collapse (`09-skills.png`). Fix: sticky group index or a filter input reusing the planner's search.

---

## Top 10 fixes (priority order)

1. **Resolve all type names** in Orders/Transactions/Assets (widen SDE snapshot or lazy `/universe/names/` lookup); resolve asset-container labels to ship/container type names. [§5, high]
2. **Fix optimizer readout**: reconcile segment math vs computed queue, replace Total/Current/Savings triple with a single verdict sentence ("Remapping saves X" / "No remap helps"). [§3, high]
3. **"Reconnect" dead end**: add a login action button to every scope-missing/reconnect empty state, and make no-op REFRESH toast why. [§2, high]
4. **Mobile overflow nav**: "More" sheet exposing Wallet/Assets/Mail/Calendar/Contracts/Orders. [§8, high]
5. **Sign + color transaction totals** (`isk-pos`/`isk-neg`) and humanize journal ref types. [§5, med]
6. **Explain remap segments**: actionable "remap to PER/WIL before skill N" line + remap markers in the computed queue; label the Remaps input. [§3, med]
7. **EFT import polish**: dedupe warnings (×N), tag already-trained skills in preview, "added N skills" confirmation, "new plan from fit" option. [§4, med]
8. **Industry jargon tooltips** on RESULTS chips (ME/TE/EIV/cost index/SCC) + clarify trade-hub ↔ build-system coupling. [§6, med]
9. **Computed-queue honesty**: "all entries already trained" state + dim trained entries; label the two time columns. [§3, med]
10. **Offline/sync visibility**: toast on failed manual refresh; sync dot gains visible text in error/offline states; branded boot spinner with timeout error. [§1/§8, med]
