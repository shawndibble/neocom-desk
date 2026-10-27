# Scope decisions — Deleting a Production Run from the Sold menu

_Recorded 2026-09-08._

- **The "Sold" split button's menu owns deleting a run, on both surfaces.**
  Records had no delete at all: its rows navigate back to the run's own Build
  Plan, so the per-plan panel's edit modal — and the danger button at the
  bottom of it — was the only way to drop a run logged in error, and a run
  whose plan is gone had none. The split button is already the one per-row
  control both tables render, so the item goes there rather than into a second
  actions column that would exist only on one table. This rules out reading
  the Records table as strictly read-through: it is where a mislogged run is
  most likely to be _noticed_, so it is where the fix belongs.
- **It confirms first; the edit modal's button still does not.** Deliberate
  asymmetry, not an oversight. Reaching the modal's button costs a row click
  and a scroll past the run's own figures; a menu item sits one mis-click from
  the chevron, next to two benign linking actions. What it destroys is not
  local — `markProductionRunDeleted` tombstones the run and cascades to its
  sale links and watched orders on every synced device. This rules out the
  confirmation being a general policy for the panel: friction is measured per
  entry point, not per operation.
- **One verb for the operation: "Delete production run", not "Remove".** The
  panel already had that exact string on the edit modal's danger button, and
  both now appear in the same Production Runs panel. A second verb for one
  destructive action reads as two different actions. The internal API follows
  the label (`confirmDeleteRun`/`deleteRun`), which also matches `markProductionRunDeleted`
  in the sync layer.
- **The action and its dialog live in `useSaleLinking`/`SaleLinkingModals`,
  not in each panel.** Both panels already mount the hook and the modals
  component once, so both get identical behaviour with no duplication; passing
  a delete callback down through `soldActionsColumn` instead would have made
  each panel own a confirmation dialog, and `ProductionLogPanel` has no delete
  machinery to hang one on. This widens that hook past sale-linking, which its
  docstring now says outright.
