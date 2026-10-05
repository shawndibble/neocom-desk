# Scope decisions — Interaction grammar: one cue per intent, familiar look and our own destinations

_Recorded 2026-10-05._ The rules themselves live in `docs/DESIGN.md` §6c.
This file records why the contested ones were chosen.

- **Familiar look, our own content.** Links, buttons, tooltips, menus and
  gestures look and behave the way pilots know them from the web and from
  EVE tools (zKillboard, EveWho, EVE Tycoon, the client), so nobody relearns
  a Neocom-only habit. We don't have to copy other tools' destinations or
  content.
- **Solar system → Route Safety.** Kept deliberately. The client, zKillboard
  and dotlan open system info instead, but the link still looks like every
  other entity link; only the destination is ours.
- **Item → Market, not Show Info.** EVE web tools send items to their own
  item page. The client's left-click Show Info habit is served by the ⋮
  menu and an ⓘ in Market's header. Keeping Market also keeps the ~40
  existing `MarketItemLink` sites as they are.
- **Entity names are real URLs, even for modals.** zKillboard and EveWho
  users middle-click names into tabs; a button-only name breaks that.
- **Table entity names are accent at rest**, as zKillboard and EveWho style
  them. A hover-only underline gives no cue on touch.
- **No native `title=`.** Touch, keyboard and screen-reader users can't reach
  it. MDN calls it "highly problematic".
- **Hold shows a control's label only where no row menu claims the hold.**
  On icon buttons and chips, hold is the only touch path to the label, which
  matches Android and Material. Inside a row with a menu, hold opens the
  menu, as on iOS. That retires tooltip hold inside rows (`holdToReveal`,
  `IskAmount revealOn="longPress"`).
- **Sources checked:** WCAG 2.2, WAI-ARIA APG, Apple HIG, Material, Windows
  guidelines, NN/g and GOV.UK. The audit and research are in the
  interaction-grammar artifact from this session.
