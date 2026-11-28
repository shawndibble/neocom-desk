# Scope decisions — Fitting Compare leads with a Baseline, head to head, loadout diff

_Recorded 2026-11-28._

- **The first Fitting in the URL is the Baseline.** Every percentage on the page is that Fitting's
  change against it, and a card's "Compare others to this" moves its Fitting to the front. No
  separate baseline setting: the order already lives in the share URL, so a shared link keeps the
  same Baseline. Comparing every fit to the best value was ruled out: the best moves per stat, so
  no one fit reads as the reference.
- **The page answers "which fit, and what do I give up?" before it lists stats.** Fit cards
  (verdicts, price, "Best at …"), then a seven-row head to head (applied DPS with its range, EHP,
  sustained tank, speed, lock range, capacitor, price) with bars and deltas, then the loadout
  side by side, then every stat folded by section. The table of ~60 rows with a check on the best
  value hid how far apart two fits were.
- **Price is shown but never ranked.** It keeps the earlier rule that cost has no best side: its
  delta reads neutral and it never counts as a win.
- **The loadout diff counts copies and charges.** A module is "in every Fitting" only up to the
  smallest count any Fitting carries, and the same launcher with another charge is a change. It
  replaces the "Modules that differ" count table and its export.
- **The phone keeps every Fitting on screen.** Cards scroll sideways; each row stacks the fits as
  A / B / C under its label, replacing Previous / Next paging.
- **Opened from the editor, the page links back to it** (Origin crumb) and marks the editor's pair
  as Saved and Your edits. Compare from the library row menu carries no origin.
- **A Fittings library bulk "Compare" is not built.** The library has no multi-select; its row
  menu's Compare stays the way in.
- **No "Add a fitting" card in an empty slot.** The header's "Compare with" already adds one
  (§6c restraint: a second control for the same action is clutter); it states the three-Fitting
  limit when full.
- **A card's ⋮ has no "Open in the editor".** The Fitting's name is that link; the menu holds
  only what the card can't do in one tap (Compare others to this, Replace with, Remove).
- **A card names the hull, not its class.** There is no shared hull-class lookup, and the hull
  name already tells a pilot the class.
- **CPU, powergrid and calibration stay separate used and total rows.** The export keeps one
  number per cell, and over-budget already reads on the card ("Over CPU by 34").
- **A Fitting whose stats fail keeps its column.** Its cells read "—" so every other Fitting's
  numbers stay under its own card.
- **The per-Character "Can fly" list fills in once every Character is checked**, not row by
  row, now that it loads through `useKeyedLoad`.
