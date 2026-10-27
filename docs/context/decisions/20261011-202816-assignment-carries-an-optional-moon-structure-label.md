# Scope decisions — Assignment carries an optional Moon / structure label

_Recorded 2026-10-11._

- **An Assignment may carry a free-text "Moon / structure" label.** ESI names no structure, so a pilot billing one landlord at two moons needs their own tag to tell the slices apart. Metadata only: not in the coalesce terms key, pricing or merging, and synced like any other optional field. Set in the Assign and Split dialogs (Split labels the new slice; the kept slice keeps its own), autocompleted from labels already used for that Payee and system, shown beside the Payee and in the detail subtitle, and exported as a CSV column. Rules out a structure lookup (ESI cannot list a system's structures).
