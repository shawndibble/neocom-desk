# Scope decisions — Offline services folds into Structures' Problems only setting

_Recorded 2026-10-24._

- **Offline services is retired; Structures gains Show: All structures /
  Problems only.** Both kinds read the one `structures` feed, and the
  Structures table already names each structure's offline services, so two
  widgets answered one question. Problems only keeps a structure with a
  reinforcement timer, fuel at the board's warning or worse (3 days or less, or
  dry: the same threshold the State column calls Low fuel), or an offline
  service. Its Number counts the structures that need attention and names the
  worst; an empty result is good news ("No structure needs attention."), not
  "no structures". Rules out a separate per-service list: the row names the
  structure and its state, which is what a pilot acts on.
- **A saved Offline services widget becomes Structures on Problems only, in
  place.** `parseLayout` converts it on read (`migrateRetiredKind`), keeping its
  id, position, size, view and title; the stored value changes only on the
  pilot's next edit. Dev and prod share Firebase: prod's older parse keeps the
  unknown `structuresShow` field on a known kind and ignores it, so a migrated
  layout opened there shows every structure in that widget, never an error.
- **The Corp Board default drops Offline services** rather than adding a second
  Structures widget; the default's Structures widget already lists the faults.
