# Scope decisions — Touch sizing uses the 36px scale (issue #4877)

_Recorded 2026-10-25 · issue #4877._

- **The `md` control scale is 36px (`h-9`) on touch too.** No `touch:h-11`. Covers `Button`, `IconButton`, `FilterChip`, `TextInput`, `SearchInput`, `NativeSelect`, `SelectTrigger`. Rules out a separate 44px touch tier for form controls.
- **Menu items, Select items, checkbox label rows, drag grips and resize-separator hit areas follow the scale.** No 44px exceptions. Controls on one line stay the same height; one that needs `touch:` sizing to match uses its neighbours' tier, never 44px.
- **The DataTable dense-card row ⋮ shrinks to 36px.** Line one of a dense card is only as tall as its text, so the `dt-dense-lead` overhang workaround (#4875) is removed.
- **Bottom nav stays 44px.** `NavItem` and `MobileMoreSheet` are primary nav targets, not form controls; not an exception to fix.
