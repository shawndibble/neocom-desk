# Scope decisions — Corp assets location rows unfold their containers

_Recorded 2026-11-20._

- **By location, a row's caret unfolds what it holds, nested by container.** Corps sort a
  division into containers (and ships), and a flat list hid that. Each location row (division,
  Corp deliveries, other place) gets a leading caret button (§6c `trigger: 'button'`) that opens
  a nested list: containers first, each opening to its contents, then loose stacks, by value.
  The row's own click still opens the by-item view filtered to it, so the ledger
  (`20261021-163150-corp-assets-is-an-inventory-ledger-not-a.md`) stays the page's frame; this
  is a peek, not a return to the division-first drill-down tree. Under a search, a container
  that does not match still shows when something inside it does (`buildContentsTree`).
