# Scope decisions — Fitting Share page is two columns, login joins the notice strip

_Recorded 2026-10-29._

- **The public Fitting Share page lays out two columns from `lg` up**: Ring and module list on the left (30rem), the stats column on the right (about 22rem). `ShareShell` takes an optional `wide` (`max-w-4xl`); the other share pages stay at `max-w-3xl`. Below `lg` it stacks, Ring first. The Ring shrinks with its column instead of filling a 768px frame.
- **A signed-out visitor's login moves from the header into the amber "Shown with skill level V - login to see with your skills." strip** (`ShareShell`'s optional `notice`). This refines `20261009-113400-share-pages-carry-the-brand-and-the-way`: the way in is still above the content and still appears once, but beside the sentence that explains why to log in. Other share pages keep the header login.
- **The share expiry sits beside Copy fitting** in the actions slot, not on its own row.
