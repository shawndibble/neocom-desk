# Scope decisions — Appraisal gets a From my Fittings source, not a Fit set page (issue #4550)

_Recorded 2026-10-20 · issue #4550._

- **Several Fittings with hull counts are a second source for the Appraisal list, not a page, tab or new result view.** Appraisal already nets owned stock (Minus owned, a station or all locations), reads an EFT fit on its own (see [20260914-180533-appraisal-reads-an-eft-fit-on-its-own.md](./20260914-180533-appraisal-reads-an-eft-fit-on-its-own.md)) and copies a multibuy. The picked Fittings flatten into one item list (each fit's lines times its hull count, merged) and go through the same Appraise flow. This rules out a "Fit Value"/"Fit set" tab, a Doctrine concept, and any second result table.
- **The card title is the source select ("Paste" | "From my Fittings"), and Recent shows only for Paste.** Recent holds pasted text, so it means nothing for the Fittings source. This rules out a segmented toggle under the title.
- **The picked set persists as one account-wide synced setting array** (Fitting id and hull count per row), like Stock Lists. This rules out a new synced collection (it needs a hand-deployed Firestore rules clause and one denied collection breaks the sync pass), named or shared sets, and corp hangars.
- **"Send to Build Group…" joins the Appraisal actions menu for any result, not only the Fittings source,** and only when at least one line has a blueprint; it sends the to-buy quantities (net of Minus owned when it is on) and reuses Fit Import's group creation and its report of unbuildable lines. This rules out a separate button on the input card.
- **On a phone the Appraise and Clear buttons sit side by side** in the paste card (Appraise is no longer full width).
