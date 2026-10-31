# Scope decisions — Table controls are icon-only at every width

_Recorded 2026-10-30. Amends tier 2 of `20261008-115843-header-controls-follow-three-tiers`._

- **The funnel, the column picker and the table Export trigger are icon-only at every width.** Tier 2 asked for icon + text from `md` up, but it shipped as opt-in props (`FilterBar triggerLabel`, `ColumnPickerMenu showLabel`, `TableActionsMenu showLabel`) that 9 of about 100 call sites turned on. The rest read as icons, so a few labelled ones looked like the odd ones out. The props are removed, so a page cannot opt back in; the name lives in the accessible name and the tooltip.
- **Other tier-2 actions keep their words.** `IconButton visibleLabel` stays for actions that are not one of these three controls (Skills' Compare with, PI's New to PI, Pilot Lookup's Share, the Wallet journal breakdown).
- **Not table exports.** A file-format export that is its own feature (a fitting's Export, a skill plan's Export) is a text `Button` and stays one.
- **Rules out:** per-page label opt-ins on these three controls, and a labelled Export in a header's text-labelled group.
