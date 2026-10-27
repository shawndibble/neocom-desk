# Scope decisions — Mining: Ore Form setting, Compressed by default

_Recorded 2026-10-06._

- **New synced setting, "Ore Form": Compressed (default) or Raw.** Extends the
  2026-09-06 decision (price compressed ore at Jita buy), which hard-wired
  Compressed. It lives in Settings → Mining tax beside "Edit ore values
  individually", syncs like it, and shows in the Tax tab's settings modal.
  Compressed = today's behaviour; Raw prices and names the raw type.
- **Scope:** ore, moon ore and ice. A type with no plain "Compressed"
  counterpart falls back to Raw in both modes. Gas clouds are untouched.
  "Batch Compressed" ore is out of scope. No server change: the saved price
  snapshots already cover both forms.
- **Display follows the setting everywhere ore is named:** Tax rows and detail
  window, Overview table summary, charts and the day detail window. Compressed
  shows "Compressed Zeolites", "Compressed Clear Icicle", etc.
- **Flipping the setting re-prices Unassigned and Outstanding rows.** Paid,
  Dismissed and needs-review rows stay frozen (invoice semantics). A frozen
  row's ISK is the truth: its ore names follow the current setting, with no
  "priced as raw" note, and may differ from how it was priced.
