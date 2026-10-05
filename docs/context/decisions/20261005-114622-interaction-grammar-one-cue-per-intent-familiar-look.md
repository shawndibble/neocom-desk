# Scope decisions — Interaction grammar: one cue per intent, familiar look and our own destinations

_Recorded 2026-10-05._

- **Familiar look, our own content.** How links, buttons, tooltips, menus and
  gestures look and behave follows the conventions pilots know from the web
  and EVE tools (zKillboard, EveWho, EVE Tycoon, the client). Where a link
  goes and what a view shows is ours. This rules out Neocom-only cues for
  familiar intents. It does not oblige us to copy other tools' destinations.
- **Entity destinations are fixed per type.** Item → Market browser.
  Character, corp or alliance → Show Info. Skill → skill modal. Contract →
  contract modal. Solar system → Route Safety (kept deliberately, although
  other tools open system info). Station → not clickable. Entity names are
  real URLs, even for modals.
- **Table entity names are accent at rest**, matching zKillboard and EveWho
  table links, rather than text colour with a hover-only underline (no cue
  on touch). A column is all links or none.
- **No native `title=` tooltips** outside `src/components/ui`. Touch,
  keyboard and screen-reader users can't reach them.
- **Two ISK forms.** Full precision where the exact figure matters,
  `IskAmount` everywhere else.
- **Touch-and-hold opens the row menu, never a tooltip.** One meaning per
  gesture. This retires `holdToReveal` and `IskAmount revealOn="longPress"`.
- **The rules and their sources** (WCAG 2.2, APG, Apple HIG, Material,
  Windows, NN/g, GOV.UK) are in DESIGN.md §6c.
