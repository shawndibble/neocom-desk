# Scope decisions — The Appraisal page shows the refined minerals and, beside it, Refine + ore

_Recorded 2026-11-02. Supersedes `20261101-210152-the-refine-total-is-minerals-plus-the-leftover.md`._

- **The Refine total column and the Refine chip are the refined minerals alone, net of tax.** That is the figure the pilot's corp mates ask for, so it is what the page leads with. Units too few to fill a portion (the leftover) are not in it.
- **A second column, Refine + ore, adds the leftover units at their as-is price on the selected Price Basis.** It is what refining leaves you holding, and the figure the refine-versus-sell verdict compares, so the green "refine wins" mark sits on both columns and the old "!" footnote is not needed. It starts on from 1440px and one tick away in the Columns menu below that: a second default column slid the row menu out of the table at 1024 and 1280px, as the other optional columns already shed to avoid.
- **The breakdown's comparison and by-item tables carry both figures too**: Refined (minerals) and Refined + leftover ore, so every number on the page can be found there, and the Difference is against the with-leftover figure. In the minerals table the Minerals row is bold under a heavier rule, and Total with leftover is plain, so the minerals read as the sum of the lines above them.
- **Engine names say which is which**: `refineMineralsFor` / `refineMineralsOfRows` (the page), `refineWithLeftoverFor` (the verdict and Refine + ore). The CSV has both columns, on the buy basis.
