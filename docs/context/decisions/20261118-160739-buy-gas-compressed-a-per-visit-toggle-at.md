# Scope decisions — Buy gas compressed: a per-visit toggle at an assumed 80% yield (issue #6395)

_Recorded 2026-11-18 · issue #6395._

- **Decompression yield is an assumed 80%, labelled on screen.** CCP's stated base for gas decompression at a structure is 80%, before the Gas Decompression Efficiency skill (+1% a level) and structure bonuses; the repo's reprocessing efficiency cannot model it (no specialisation skill means the scrap path). Skill and structure inputs are not modelled yet, so the comparison note states the assumed figure rather than baking it in silently.
- **The toggle is per visit, off by default, and not synced.** It changes what one copy contains, not a preference worth carrying between devices.
- **Only the Build Plan Materials copy gets it, not the Build Group panel's per-hub copy.** The ticket names the Materials copy action; the group panel can follow if asked.
- **The comparison uses flat hub sell prices**, as the ticket's own numbers do. A gas line with no price makes the totals partial, never free.
