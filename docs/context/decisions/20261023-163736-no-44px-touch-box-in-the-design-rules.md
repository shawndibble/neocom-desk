# Scope decisions — No 44px touch box in the design rules

_Recorded 2026-10-23._

- **The 44px touch-box rule is gone from `docs/DESIGN.md`.** Chasing a 44px target kept costing layout: it stretched card lines, padded cells and pushed controls out of their rows (the Mining Tax ⋮ in #4865). The bar is WCAG 2.5.8's 24px minimum with no overlapping targets. Rules out growing a control, padding a cell or overhanging a hit area to reach 44px in new work.
- **Existing sizing is untouched.** `controlStyles.ts`'s `touch:h-11` tier, the `touch:min-h-11` menu and select items, checkbox label rows, drag-grip hit areas and the e2e specs that assert 44px stay as they are until their own tickets change them; the docs now call that history, not a rule to copy.
