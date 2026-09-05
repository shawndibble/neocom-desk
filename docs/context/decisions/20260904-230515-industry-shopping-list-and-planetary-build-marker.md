# Scope decisions — industry shopping list and planetary build marker

_Recorded 2026-09-04._

- **The Build Plan's materials panel copies a shopping list in EVE's multibuy
  format.** `name<TAB>quantity`, one line per material, no header and no price
  column — the game parses it, so it carries only what the game reads.
  Quantities are raw digits: every other quantity in the feature is grouped for
  reading, and "1,234,567" is not a number multibuy accepts. This rules out
  reusing the materials CSV, which is a priced five-column record for a
  spreadsheet, not an order.

- **The list quantity is the material's remaining quantity, not its
  requirement.** The engine has already sized that to every run of the plan,
  reduced it by ME, and netted it against the units the plan records as owned,
  so it is exactly "what I need, less what I have" with no arithmetic to redo.
  A material with nothing remaining is dropped rather than listed as 0, and the
  copy control is unavailable when no material has a remainder — a plan that is
  entirely owned has a full table and an empty order.

- **A material the plan advises building is still on the list.** Make-or-buy is
  advice about how to spend, not a statement about what the shopping trip
  needs. Nothing is lost either way: the verdict is one level deep, so the
  sub-inputs that would replace such a row do not exist on this plan.

- **"Build" gets two markers, split by method.** A hammer sends the player to
  an industry slot and a planet sends them to a colony; those are different
  errands, and one glyph for both said only that the row was not a buy. The
  planetary marker takes the app's blue (`text-accent`) against
  manufacturing's green, so the split survives greyscale in shape and reads at
  a glance in colour (docs/DESIGN.md §7).

- **The owned-stock scope picker sits in the settings grid, not across it.**
  The select is one control the width of its neighbours and belongs in a cell
  beside them; only its location chips need the full row, so the two are
  separate grid children. This also stops the row's height from jumping when
  "Selected locations" is chosen.
