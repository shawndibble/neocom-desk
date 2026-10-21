# Scope decisions — Corporation becomes a rail group of its own pages (issue #4675)

_Recorded 2026-10-21 · issue #4675._

- **Corporation is a rail group, not one link with a sub-nav.** Its views
  (`/corp`, `/corp/members`, `/corp/wallet`, `/corp/assets`, `/corp/moons`) are
  `NavPage`s in a new `corp` group headed "Corporation", placed directly after
  `primary`, where Corp sits today. Members and Moons each have tabs of their
  own (Roles; Extractions, Miners, Statements, Moon owners), so the sub-nav made
  them three levels deep. Everywhere else in the app it's page, then tabs, and
  now Corp follows that too. `CorpSubNav` goes away. Paths don't change.
- **The whole group is conditional, so it gets a heading.** `primary` had no
  heading because a heading over Corp, which most pilots never see, would sit
  over nothing. The heading now renders only with the group, while Corp Access is
  `ready`, so that objection no longer applies.
- **Each page keeps its own Corp Capability and still hides rather than locks.**
  The capability moves from `NavSubView.corpCapability` onto the `NavPage`. An
  Accountant sees Corp Board and Corp Wallet and nothing else.
- **Names stand alone.** A page's label is its one name in the rail, the More
  sheet, Ctrl K, Recent and the browser tab, and the last four show no group
  heading. So any name that clashes with a pilot page gets a prefix: **Corp
  Board** (was Overview), **Corp Wallet**, **Corp Assets**. **Members** and
  **Moons** keep their names. The "Corp" prefix repeating under a
  "Corporation" heading is accepted. Short rail-only labels would give each
  page two names, which `labelKey` exists to prevent.
- **Corp Board, not "Corp Overview".** The page is a widget board of the
  corporation's deadlines, money and operations, and its items are already
  **Corp Board Items**. The glossary's **Corp overview** entries become
  **Corp Board** / **Corp Board layout**.
- **Corp pages can be hidden one at a time.** They leave `NEVER_HIDDEN`, which
  protected `/corp` only because it was the single way in. They join
  `DEFAULT_SHOWN_NAV`, since the gate already keeps them away from everyone
  without access.
- **No Corp page in the phone tab bar.** Same reason as before: a page that
  hides would leave a hole in the bar on any character without access. The More
  sheet gets a Corporation group with a row per visible page in place of the
  single Corporation row.
- **Corp Wallet still has no tab bar.** It's a page now, but its division strip
  and Journal/Transactions `SegmentedControl` stay as they are.
- **Supersedes** the "One level of tabs, so the page has none of its own" bullet
  in `20260929-131220-corp-wallet-moves-to-the-corp-section.md`, which assumed
  the Corp sub-nav was the tab bar, and the "beside Overview rather than inside
  a group" placement noted on `/corp` in `navDestinations.ts`.
