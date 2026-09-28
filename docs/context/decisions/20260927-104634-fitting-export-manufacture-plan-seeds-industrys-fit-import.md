# Scope decisions — Fitting Export: Manufacture Plan seeds Industry's Fit Import

_Recorded 2026-09-27._

- **"Manufacture Plan" is a new item in the Fitting editor's Export menu**
  (`FittingExportMenu.tsx`/`FittingExportItems`, shared with the phone
  header's combined menu). It does not build anything itself — it reuses
  Industry's existing **Fit Import** (issue #626): the same
  `parseEftFit` → `previewFitImport`/`fitToBuildPlans` → `applyFitImport`
  pipeline a pilot already gets by copying EFT text and pasting it into
  Industry's own dialog. This entry point only removes the copy/paste step.
- **Navigates to `/industry`, pre-filled and already parsed, rather than
  applying instantly.** The Fitting's EFT text (`exportFitting('eft', ...)`,
  the same text "Copy EFT" would put on the clipboard) travels via
  `location.state` (`IndustryFitImportState`, `lib/shortcuts.ts`) — the same
  convention `MarketAppraiseState` already uses for the Export menu's
  "Appraise in Market" item. `FitImportDialog` gained an `initialText` prop
  that seeds its textarea and its preview at mount, so the pilot lands on
  the exact "what will be built / what's skipped / what charges are
  excluded" preview Fit Import already shows for a pasted fit, and presses
  Apply themselves. Chosen over applying immediately and jumping straight to
  the new Build Group, because a routine fit has roughly a fifth of its
  lines unbuildable (faction/named modules with no blueprint) and the
  existing dialog's preview-before-apply exists specifically so the pilot
  sees that before plans appear in their list — an instant-apply shortcut
  would silently skip that review for this one entry point only.
- **Charges/ammo default to excluded**, matching Fit Import's existing
  default (`includeCharges: false`) — unchanged by this feature. The
  pre-filled dialog still shows the "Include loaded ammo" checkbox, so a
  pilot who does want it can turn it on before applying, same as always.
- **No new algorithm.** This feature adds no new bill-of-materials logic —
  it is entirely a new _arrival path_ into code that already existed and
  already shipped.
