# Scope decisions — The Appraisal CSV follows the Price Basis

_Recorded 2026-11-15. Supersedes the CSV line of `20261101-214901-the-appraisal-page-shows-the-refined-minerals-and.md` ("The CSV has both columns, on the buy basis")._

- **The live Appraisal's CSV prices its Refine total and Refine + ore columns on the pilot's remembered Price Basis**, the same as the table. A pilot on Split or Sell exported buy figures that disagreed with the page they were looking at. A Shared Appraisal's file still has no refine columns.
- **Engine names are now `rowFigures` / `pileFigures`** in `src/engine/market/appraisalRowFigures`, with the basis a required argument: `rowFigures(...).refine.minerals` (and `pileFigures(...).refineMinerals` for the chip) is the page's figure, `refine.withLeftover` is the verdict's and Refine + ore's. They replace `refineMineralsFor` / `refineMineralsOfRows` / `refineWithLeftoverFor`.
