# Scope decisions — Public Info's Character tab is Pilot Lookup's view

_Recorded 2026-09-30._

- **The Public Info Modal's Character tab renders Pilot Lookup's result
  (`features/travel/PilotProfileView.tsx`), not its own summary.** One view
  of a character, wherever it's opened: identity (with security status and
  character age), zKillboard stats, the ships used most on kills, and recent
  kills and losses with expandable fits. The old tab's portrait + security
  status + corp/alliance list and its zKillboard link-out are gone. The
  Corporation, Alliance and Employment tabs are unchanged, and corporations
  and alliances still link out to zKillboard rather than showing stats inline.
- **The caller owns the links.** Pilot Lookup's corporation/alliance links
  open the modal; inside the modal they switch tabs. The view has no
  "Public Info" link at all: in the modal it would link to itself, and on
  Pilot Lookup it would only open the same view over the page (removed at
  Shawn's call after #2361).
- **A character's chain follows the live affiliation.** The modal loads the
  character through `loadPilotProfile`, and the Corporation and Alliance tabs
  use its corporation and alliance ids, not the cached public record's
  (`STALE_AFTER.static`), so the identity block and the tabs never disagree
  after a corp move. Round 50's "character → its corp → its alliance" chain
  otherwise stands.
- **The dialog is `wide` for a character request** (chosen by the request's
  kind, not the active tab, so it doesn't resize on tab switches), and the
  view is lazy-loaded because its fits pull in Fittings while the modal is
  mounted app-wide.
- **The modal closes when its pathname changes**, so Open in Fittings from a
  killmail fit lands on Fittings rather than under the dialog. A query-only
  change (a page syncing filters to the URL) leaves it open.
