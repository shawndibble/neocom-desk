# Scope decisions — The character picker rides first in the page header's control cluster

_Recorded 2026-10-22. Supersedes the placement half of
`20260908-192806-the-character-filter-rides-in-the-panel-header.md`; its
"hidden for a one-character account" rule stands._

- **Every page that offers the This character / All characters / Corporation
  picker renders exactly one, in its `PageHeader`'s `scope` slot: the first
  item of the right-hand control cluster.** Before this the picker sat in six
  different places — `PageHeader.meta`, `PageHeader.actions`, `Panel.meta`,
  table toolbars and body strips — so a pilot looked for it somewhere new on
  every page. The right-hand cluster is the one position that stays put: the
  left side moves with the title's length and with whatever the page puts in
  `meta` (data age, counts, stat chips), while the cluster is anchored to the
  edge. Market orders and Contacts already put it there and read well. The
  2026-09-08 argument for `meta` ("a noun naming whose data, not a verb")
  still describes the control; it just loses to a position that never moves.

- **One picker per page.** A page whose panels each had their own picker gets
  one page-level picker that drives them all. Industry merged its two
  (`jobs.chars` on Active Jobs and `opps.chars` on Opportunities) into one,
  `industry.chars`, in the Industry header on every Industry page; the old
  params still open a link, and the old per-panel remembered picks seed the
  merged one (`industryCharacterFilter.ts`).

- **The cluster's order is fixed:** picker → text-labelled page actions
  (Compose, Payees, a labelled Export…) → icon-only actions (Refresh) → ⋮
  More actions (`HeaderMoreMenu`) → `AlertsBell`. Words on the left, icons on
  the right; the ⋮ is always the last action, just before the bell.

- **Same height as the icons beside it, enforced.** Inside a `PageHeader`
  cluster the picker takes the header's touch tier on its own
  (`PageHeaderClusterContext`): 44px tall below `md` and on a touch pointer,
  36px from `md`, whatever `size` the page passes. `HeaderMoreMenu` has no size prop and
  always draws at that tier.

- **The trigger's look** (superseded by the avatar stack below). Below `lg` it stays the icon-only box, the same
  square as the `IconButton`s beside it (44px below `md`, 36px from `md`) (the
  active Character's portrait, the `AllCharacters` glyph, or for Corporation
  the active Character's own corporation logo). The logo comes from the
  Character's cached `corporationId` (no new ESI call), with the `Corporation`
  Buildings glyph while it loads, on error, or when no corp is known; the
  glyph box stays the portrait's size either way. The menu items carry no
  glyphs. From `lg` up it is a text pill with the same glyph leading the
  words and a trailing caret, with the header `IconButton`'s border, fill and
  hover. The label only ever reads This character, All characters (with its
  count where the page passes one) or Corporation.

- **A header with a picker never wraps onto a second line.** Passing `scope`
  locks the title row: the `<h1>` truncates (full name in its `title`),
  `meta` shrinks and clips, and the cluster neither wraps nor shrinks. A page
  with more actions than fit moves its low-priority ones into the ⋮ at narrow
  widths, choosing in JS (`useIsPhone`, `useIsDesktop`, `useMediaQuery`),
  never by rendering both and hiding one with CSS. A ⋮ still needs two or more
  real actions, and Refresh stays a standalone icon. `subNav` keeps its own
  line below `md`. Without `scope` the header wraps as before.

- **Partial coverage and loading ride in the trigger, not beside it.** The
  "Not included: …" readouts and the spinners pages put next to the picker
  move into it: with `missingNames` and the value "all", a warning dot marks
  the trigger at every width, its accessible name adds "Not included: {names}",
  and the open menu shows that line as a non-interactive note. The label does
  not change: no "3 of 4" on the trigger. `loading` swaps the glyph for a
  `Spinner` in the same box, so the trigger never resizes.

- **Out of scope:** the Overview's per-widget scope readouts
  (`CharacterScopeReadout`), "Include corp" chips, the Corp routes, the
  Settings › Character defaults form field (`variant="field"`, a setting, not
  a page filter), and the Assets/Ships empty-state "Show all characters"
  shortcut, which is a recovery link inside an empty state rather than the
  page's picker.

- **Words only from `lg` (amended 2026-10-22; superseded by the avatar stack below).** The pill first started at
  `md`. With the sidebar showing, a 768px row left about 190px for the title
  and data age beside the pill and three icons, so titles like CONTRACTS
  clipped. Between `md` and `lg` the trigger is now the 36px icon square, with
  the same glyph, warning dot and spinner. The words show from `lg`, where the
  row has room for them.

- **An avatar stack replaces the pill (amended 2026-10-22).** The trigger has
  no words at any width. It shows the same faces and a small caret
  everywhere, at the `IconButton`s' height:
  - This character: the active Character's portrait.
  - All characters: up to three overlapping portraits of the Characters it
    covers, the active one first, then roster order, with a "+N" chip for
    the rest. Characters in `missingNames` are left out of the stack.
    Below `md` the stack draws two faces, with "+N" counting the rest. With
    three faces, five Characters clipped CONTRACTS on a 390px phone.
  - Corporation: the corp logo.

  The full words stay in the accessible name and in a hover/focus tooltip,
  and the open menu keeps its text options. The warning dot and the spinner
  stay; the spinner stands over the faces, so the trigger never changes
  width. This supersedes "words only from `lg`" above. The `field` variant
  in Settings is unchanged.
