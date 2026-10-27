# Scope decisions — All owned is a view toggle on Build Opportunities (issue #2335)

_Recorded 2026-09-30 · issue #2335._

- **"All owned" is a view toggle (`?opps.view=owned`), not a filter state or a new tab.** It shares the Opportunities tab's blueprint load and Character filter but shows a different row set (every owned blueprint, reactions and unpriceable ones included) with different columns, so a filter on the ranked table would have had to hide half its columns. Ranked stays the default view.
- **ISK/hour in "All owned" is borrowed from the ranked rows, never computed separately.** A blueprint Opportunities can't rank (reactions, no prices) shows no ISK/hour rather than a second pricing path.
- **Corp blueprints use the active Character's corp access only**, behind a toggle that only appears for a Character that can read corp blueprints (Director). Corp assets aren't loaded here, so a corp blueprint in a container or an office hangar can read "In container" / "Unknown location".
