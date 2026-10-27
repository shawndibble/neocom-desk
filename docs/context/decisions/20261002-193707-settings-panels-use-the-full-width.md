# Scope decisions — Settings panels use the full width

_Recorded 2026-10-02._

- **Every Settings panel fills the content column; none caps its body at `max-w-md`.** Before, ten panels held their controls in a 448px column inside a ~950px card. Display, Permissions, Notifications and the Activity Log ran full width, so the sections did not match each other. Paragraphs still stop at `max-w-2xl` so a line stays readable. The page itself keeps the app-wide `max-w-6xl`.
- **A panel of settings is a `Fields` grid in its `form` look.** The label sits on the left, the control on the right and the hint dim under the control, with a hairline between rows. Below `lg` each row stacks. A lone checkbox keeps to its label's line, at the far edge. This is the "stacked controls line up" rule in DESIGN.md §6, and the fitting stats column's grid is now the same shared component.
- **Lists and small cards go two-up from `xl`, not one wide strip.** Permissions lists its scopes in two columns. Data & storage puts Data beside App updates and Export beside Import, so a round trip sits side by side. Data age and Log out stay full width. Avoided systems fills columns of names.
