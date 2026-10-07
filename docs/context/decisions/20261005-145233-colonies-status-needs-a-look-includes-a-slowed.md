# Scope decisions — Colonies status: Needs a look includes a slowed extractor (issue #2635)

_Recorded 2026-10-05 · issue #2635._

- **A colony whose every extractor is past its efficient window, but not yet expiring, reads "Needs a look".** The ticket defines the status as storage filling before the haul or idle factories; a slowed program is neither, but it costs output and has a restart fix, so calling it Healthy next to a Restart action contradicts itself. Expiring and Stopped still outrank it.
- **Another Character's colonies get the same status and meters but no ISK figures or fixes.** They are read cache-only with no prices, skills or customs behind them, so building a `PlanAdvice` per alt would invent numbers. Their way to act is "Switch to".
- **The Colonies tab drops the old infrastructure-pin chip list.** The mockup replaces it with the Command Center load and the Launchpad block.
