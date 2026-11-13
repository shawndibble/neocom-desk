# Scope decisions — New fitting is two panes and Popular fits is one list

_Recorded 2026-11-13._

- **New fitting is a two-pane `page` dialog.** Hulls are on the left and the
  picked hull is on the right: its can-fly mark, its mastery, "Start empty fit",
  and its Popular fits. Until a hull is picked, the right pane says "Pick a hull
  to start". On a phone the dialog is full screen and shows one pane at a time.
  Picking a hull shows it, and "Hulls" goes back. This replaces the single
  `center` column, which left the fits about 270px of height.
- **Recent hulls, and an "Only hulls I can fly" filter.** These supersede part
  of decisions `20260924-215855` and `20261107-001807`. With nothing typed, the
  left pane lists the hulls of the Character's most recently saved Fittings
  (five at most). A Character with none still sees only the search box and its
  hint. It is still never a list of every flyable hull: Ships › Tree is the place
  for that. The checkbox narrows the search results and the recent hulls to
  hulls the Ship Tree marks as flyable. It costs no extra check, because the
  marks are already loaded for the dots.
- **Popular fits is one list, not a zKillboard tab and an EVE Workbench tab.**
  Both sources load together and merge. A source filter (All / Seen in losses /
  Guides) gives each source's count, and those counts never change with the
  other filters. Every row is tagged Loss or Guide. An "i" beside the heading
  says in a tooltip that losses come from zKillboard and guides from EVE
  Workbench. The list is the same in the
  New fitting dialog and in Ship Info › Fitting.
- **"Can fly now", and a sort.** The checkbox keeps only the fits the active
  Character can fly, and shows the flyable/total count. The sort options are
  Newest (default; last seen or published), Most seen, Least training and
  Cheapest. With nothing flyable, the list says so and names the fit with the
  least training left. It offers "Show all fits", and "Show the closest", which
  sorts by training and opens that fit's skills.
- **A missing-skills verdict opens in place.** It reads "3 skills · 26d 10h" with
  §6c's leading caret, at the Character's attributes and implants (the Missing
  skills chip's schedule). Opening it lists the skills and adds them to a Skill
  Plan, not the in-game queue, which ESI can't write. "Can fly" and "Skills
  unknown" stay plain verdict pills, which never open.
- **A loss row keeps "N losses · last seen …".** A zKillboard loss has no name,
  and the row doesn't invent one. The ISK sits outside the truncated title, so a
  long name gives way first and the price always shows.
- **Rack initials on the module icons.** Each rack's group starts with H, M, L,
  R or S. The group's label still names the rack in full for screen readers.
- **Ship Info › Fitting.** The stats are in two columns. On a phone they fold
  behind "Slots and fitting resources", so the fits start near the top.
  "Simulate" is now "Start empty fit", the same words as the New fitting dialog.
