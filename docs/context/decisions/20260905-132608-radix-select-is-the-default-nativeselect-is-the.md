# Scope decisions — Radix `Select` is the default; `NativeSelect` is the exception

_Recorded 2026-09-05._

- **Every select in the app uses Radix `Select`; `NativeSelect` keeps only the
  cases a future caller can argue for, and has no product call sites left —
  only its Styleguide entry and its own test.** This
  reverses the rule `NativeSelect`'s own doc comment and `docs/DESIGN.md`
  carried — "the native mobile picker beats any popover" for a short static
  list in a form. Two selects sitting side by side in the Loyalty Store filter
  row made the cost visible: identical closed, then one opens the OS menu and
  the other opens our panel. One list styling everywhere beats a per-control
  judgement call that shows as a seam wherever two selects meet. ADR 0004
  (why Radix at all) is unaffected — this narrows _when_ to reach for the
  platform control, not whether Radix was the right base.
- **`NativeSelect` stays in the component library rather than being deleted.**
  It is the escape hatch for a case that genuinely wants the platform picker —
  a long list on mobile, say. `docs/DESIGN.md` now states `Select` as the
  default and `NativeSelect` as the one needing a reason.
- **`SelectGroup` / `SelectLabel` were added to `Select`** so a converted
  caller can express what `<optgroup>` expressed; the PI plan's product list
  is grouped by tier and had no other way across.
