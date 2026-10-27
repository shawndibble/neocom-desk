# Scope decisions — Retire the PI Advisor: accepted feature drops (issue #2618)

_Recorded 2026-10-05 · issue #2618._

- **The Advisor tab is deleted, and these Advisor functions are accepted drops.** Plan, Colonies and Map carry the Advisor's jobs; the pieces below had no home there and are not rebuilt for the retirement:
  - **System picker (`?system=`).** Colonies and Map read every system the pilot has a colony in; nothing is scoped to one system any more. The param is gone, not inert.
  - **"Build up to" recommendation (#426)** per built colony.
  - **Restart-cadence yield percentage.** The cadence setting stays in page settings and the header; the per-program yield readout does not.
  - **Plan with alt colonies.** Colonies' alt toggle stays display-only; no plan or advice routes across alts' colonies (see #2619 for alt characters).
  - **Unbuilt-planet estimate cards.** Map's best recipe per day on a planet type replaces them (a different model).
  - **Stop-tier advice in the Colonies detail** ("switch to X, worth ~Y/h"). Plan and Map still carry it through `planAdviceModel`.
  - **Network conversions list** (what all colonies could make between them), which had no tab of its own after the skeleton work.
- **Planet richness override is dropped for now.** Its only editor lived in the Advisor's resource picker; the stored override and its estimate stay, and the editor comes back on a new tab under #2685.
- **One customs source on every PI tab.** `resolveColonyCustoms` (`colonyCustoms.ts`) costs a colony at the pilot's per-system override, else the highsec skill-derived rate, else `ASSUMED_UNKNOWN_CUSTOMS` (10%) outside highsec, and flags the last as assumed. Plan edits the rate; Colonies and Map flag the assumption and link to Plan. The Advisor's flat band default of 0% outside highsec is gone with it.
- **`/planetary-industry/advisor` still redirects to Colonies**, so old links keep working.
