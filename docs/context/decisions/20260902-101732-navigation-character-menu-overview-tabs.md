# Scope decisions (round 23) — navigation: character menu & Overview tabs

_Recorded 2026-09-02._

- The desktop rail's Character block moves from above the nav groups to a
  **pinned footer**, and stops being a link to `/characters`: it is a menu
  now (ADR 0004's `DropdownMenu`, as the plan editor's export menu already
  does) holding
  **Characters** and **Settings**, both of which leave the rail proper. Its
  accessible name is the pilot's own name — Radix supplies
  `aria-haspopup="menu"`, so a wrapper label would only make the name less
  useful. Deliberately _not_ called an account menu: an Account has no
  storage, no sync and no server-side identity, and is never surfaced as a
  thing to manage (glossary, round 1).
- **The General group is gone.** Removing Characters and Settings left it
  holding Market alone, and a heading over one item says less than the item
  does. Market moves into Economy and leads it: it is the one economy view
  that answers a question before you own anything. Overview keeps sitting
  ungrouped above the headings, so the rail is now Overview, Progression,
  Economy, Social.
- **Clones and Employment History become tabs of Overview**
  (`features/character/OverviewSubNav.tsx`) rather than rail entries, and
  keep their existing top-level paths — they are grouped _visually_, not
  re-parented under `/overview`. Nesting them would have forced a redirect
  for every existing bookmark and collapsed three independent `ScopeGate`
  decisions into one: `/clones` needs `esi-clones.read_clones.v1`, the other
  two are UNGATED, and a single gate over the trio would hide two working
  views whenever the clones grant is missing. Real routes, not a `Tabs`
  widget — same call as `SkillsSubNav`.
- The missing-scope marker travels with the route: `OverviewSubNav` renders
  it on the Clones tab, because the rail no longer lists `/clones` and round
  4's rule is that the affordance is centralized rather than per-view.
  Dropping the marker with the rail entry would have hidden a re-auth need
  behind a tab.
- The three tabs must share one width, or the page visibly resizes as you move
  between them — round 19's tiering assumed Overview stood alone, which as one
  of three tabs of a single page shape it no longer is. The app-wide
  `max-w-6xl` pass (#212) settled this on its own while this work was in
  flight, so nothing here changes a width; the constraint is recorded because
  reintroduce the jump.
- **The three tabs also share one header.** Everything above the tab strip is
  the same on all three: portrait, character name (the `<h1>`), corporation /
  alliance and the two SP chips — `features/character/CharacterHeader.tsx`.
  Nothing else — the header takes no controls slot, so the block above the
  tabs is the same on every tab down to the last pixel. A view's
  `DataAgeBadge` and its Refresh live on that view's `Panel` toolbar below the
  tabs, where Overview's panel badges already were; the panel wraps the
  loading, empty and failed branches too, since those are the states a
  Refresh exists for. Clones and Employment History previously opened with a `PageHeader`
  whose title merely restated the tab directly beneath it, so switching tabs
  swapped the identity block in and out — the same page visibly rebuilding, the
  width rule above in a different guise. The two scope-light tabs feed the SP
  chips from `features/character/characterSp.ts`, which **skips its /skills
  read entirely without the grant** and leaves the chips reading "—":
  Employment History is public and must not start demanding a scope, and a
  guaranteed 401 would raise the shell's stale-grant notice over it.
- The tab reads **"Employment"**, not "Employment History": the tab strip is
  the label's only home now, "history" is what a list of past corporations
  self-evidently is, and the shorter word keeps the three tabs on one line on
  a phone. The route (`/employment-history`), its module names and the view's
  own copy are unchanged.
- Mobile: the bottom bar drops Characters (Overview / Skills / Industry /
  More), and the More sheet leads with the Character disclosure. That
  disclosure is a hand-rolled `aria-expanded` row, **not** a `DropdownMenu`:
  `DropdownMenuContent` portals to `document.body`, outside the top-layer
  `<dialog>` the sheet opens with `showModal()`, so it would render and then
  refuse every click. It leads the sheet rather than trailing it because it
  is the only route to Settings on a phone.
- `nav.overview` is relabelled **"Home" -> "Overview"**, matching what the
  route, this document and the round 19 width table have called it all along.
