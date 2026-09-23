# Merge Fit Check + Mastery into One Unified Ships Page

## Problem

`/skills/ships` (`SkillShips.tsx`) currently segments "what skills for this
fit" and "what skills for this ship's mastery" behind a `Fit Check | Mastery`
tab switch — two separate panels, two separate mental models, for what is
really one question asked two ways: "what does this ship need." Mockups
shown to the user (design canvas:
https://claude.ai/artifact/9TKVTZibYVuRjQLNL5RvmA) explored 3 Mastery-only
improvements plus 2 ways to merge the two tabs; the user picked option
**E — Flat unified list, tagged by source**, to fully replace the segmented
tabs (not sit alongside them).

## Model

- **Ship search is the one primary input** (reuse `shipCatalog.ts`'s existing
  picker, unchanged). A ship is always identified this way, even when a fit
  is also attached.
- **"Attach a fit" is an optional, secondary action** — a collapsed
  affordance that expands into the existing paste-EFT box. Pasting a fit
  auto-selects/switches the ship search to match the fit's own hull
  (`ClipboardImportPreview.shipName`, matched against the ship catalog by
  name) when it names a different ship than what's currently selected.
  Mastery never needed a fit to begin with — this treats a fit as
  enrichment of a ship's context, not a separate mode.
- **Union of skill requirements**, deduped by skill (`unifiedShipRows.ts`,
  already TDD'd and committed):
  - Mastery: all 5 tiers' bundles from `masteries.json`, unioned. A skill
    appearing in multiple tiers takes the **max target level across every
    tier it appears in**, tagged with the **highest tier it appears in**.
    Assumes CCP's own per-skill levels are non-decreasing tier to tier —
    true in practice (Mastery is designed as a strict progression), noted
    in code as a comment, not enforced as an invariant.
  - Fit: entries from `previewClipboardImport` (unchanged EFT-fit parsing
    and dogma-attribute path — no new parsing engine).
  - Same skill named by both sources: **max target level across both**, row
    tagged with **both** "Mastery N" and "This Fit".
- **Filter chips**: "Mastery" / "This Fit" (`FilterChip`), toggle which
  source(s)' rows show. Both on by default. "This Fit" is `disabled` with a
  `tooltip` explaining why (no fit attached yet) rather than hidden — same
  convention `FilterChip` already documents for an unavailable-right-now
  toggle.
- **Hide completed** toggle, carried over unchanged from the just-shipped
  Mastery feature (#1382 / PR #1384) — same chip, same behavior (a
  display-only filter; Add All still reads the real row set).
- Rows sorted by remaining training time, ascending (quick wins first).
  Trained rows sort last (or are removed entirely by Hide Completed).
- **Add All to Plan** adds every currently **visible** (source-filtered,
  not hidden-by-completion) untrained row — same principle Mastery's
  per-tier Add already established: what you see is what gets added.
- **Total-time chip** (`StatChip`) sums every currently visible untrained
  row's remaining seconds.
- **Target Plan mechanism** (`useTargetPlan`, `TargetPlanPicker`) unchanged,
  reused exactly as Fit Check already wires it.

## What gets retired

- `FitCheckPanel.tsx` / `FitCheckPanel.test.tsx` and `MasteryPanel.tsx` /
  `MasteryPanel.test.tsx` — fully replaced by one new panel. Nothing else
  in the repo imports either component (one stray comment in
  `ItemDetailModal.test.tsx` references them by name for its own
  "Create Plan & Add" convention; the comment stays, it names a convention,
  not a dependency).
- `MasteryTierRow`'s accordion-shaped grouping (`masteryRows.ts`'s
  `buildMasteryTierRow`) — the flat view doesn't group by tier for display.
  The underlying tier-bundle data (`masteries.json` via `loadMasteries`)
  is still read directly by the new panel.
- `Tabs`/mode-switch state in `SkillShips.tsx` — one panel, no mode.
- i18n: `skills.ships.tabsLabel`, `skills.ships.fitCheckTab`,
  `skills.ships.masteryTab` (nothing references them once the tab switch
  is gone).

## What gets reused unchanged

- `shipCatalog.ts` (`buildShipsWithMastery`, ship search data).
- `scheduleEntries.ts` (one-off schedule for a set of entries).
- `fitCheckRows.ts` (`buildFitCheckRows` — the actual status/time math).
- `unifiedShipRows.ts` (`mergeShipEntries`, `tagUnifiedRows` — new, already
  committed, TDD'd).
- `previewClipboardImport` (EFT-fit parsing, unchanged).
- `useTargetPlan`, `TargetPlanPicker`, `SkillRow`, `FilterChip`, `StatChip`,
  `SearchInput`.

## UI shape

One panel, `Panel` title "Ships":

1. Ship `SearchInput` (reuses the same search-and-pick list `MasteryPanel`
   already had).
2. Below it, either a collapsed "+ Attach a fit (optional)" button, or
   (once expanded / a fit is attached) the existing paste-box UI plus a
   small "Fit attached: `<fit name>`" indicator with a remove action.
3. A filter row: "Mastery" / "This Fit" `FilterChip`s, "Hide completed"
   `FilterChip`, and the total-time `StatChip` right-aligned.
4. The flat row list: `SkillRow` per unified row, each with a small source
   tag or two ("Mastery II", "This Fit") appended. Checked against the real
   component (`RequiredSkillsSection` composes `SkillRow` directly, no
   wrapper markup — its own extra need was a relabeled `addLabel`, not an
   inline slot): `SkillRow` is a single flex row, so tags can't sit "next
   to" it without becoming part of it. Adds one small optional `tags?:
ReactNode` prop to `SkillRow`, rendered between name and the level bar —
   `undefined` renders nothing, so every existing caller is unaffected.
5. Footer: `TargetPlanPicker` + "Add All to Plan" button, exactly as
   `FitCheckPanel` already wires it — just fed the merged/filtered row set.

## Testing

- `mergeShipEntries`/`tagUnifiedRows`: TDD'd, committed
  (`unifiedShipRows.test.ts`) — multi-tier max-level/highest-tier
  tagging, both-sources tagging, no-fit-attached, no-mastery-data cases.
- New panel: UI-wiring level tests (ship search → rows render, filter
  chips hide/show correctly, Hide Completed behavior matches the shipped
  Mastery convention, Add All adds only visible untrained rows), same
  style as the retired `FitCheckPanel.test.tsx`/`MasteryPanel.test.tsx`.

## Out of scope

- No "By tier" alternate grouping toggle (shown in the mockup's segmented
  control but not wired) — flat is the only mode for this ticket.
- No "Added to plan" indicator (a related but separate feature shipped for
  Market's Required Skills in #1385) — not asked for here.
- No changes to `useTargetPlan`, the Target Plan mechanism, or any other
  Skills sub-tab.
