# Scope decisions — Improve: Explore better scores hacking and scanning from the engine (issue #5546)

_Recorded 2026-10-29 · issue #5546._

- **Explore better is scored from what the engine computes, and says so.** Hacking is the running analyzers' virus coherence, virus strength and access difficulty bonus added up; scanning is the strongest loaded probe's sensor strength. A figure the fit does not have is ignored, so the goal is offered only with a running analyzer or a loaded probe (disabled chip, reason "No running analyzer or loaded scan probe"). Scan time is not scored: a live run on a Heron showed the engine moves no launcher duration for a Signal Focusing Kit, so scoring it would reward nothing.
- **Speed and align only nudge the score.** They add or take at most 0.1 to the mean hacking and scanning gain, so a faster hull never outweighs a lost analyzer and a hacking gain is never rejected for a small speed loss. Propulsion counts as a scored job; analyzers, probe launchers and scan arrays are scored, not guarded.
- **Rig swaps need no special logic.** A CPU or powergrid rig is swapped away only when the fit still fits CPU, powergrid and calibration without it: the existing resource guardrail already rejects any swap that breaks the budget. Rigs are searched only with "Include rigs" ticked, as for every goal.
- **No explorer hull role yet.** A blank Heron or Buzzard cannot pick the goal until it holds an analyzer or probe. An `explorer` role in `improveRole.ts` is a follow-up; it spreads into the remembered goal per role.
