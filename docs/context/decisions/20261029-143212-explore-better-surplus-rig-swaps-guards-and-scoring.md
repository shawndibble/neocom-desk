# Scope decisions — Explore better: surplus rig swaps, guards and scoring (issue #5546)

_Recorded 2026-10-29 · issue #5546._

- **Every explorer module stays guarded.** `scoredJobs('explore')` is empty, so no swap drops the last analyzer, probe launcher, scan array or survey scanner, even under Rework. The score cannot see a lost launcher, so a gain elsewhere could otherwise pay for it.
- **A needed CPU or powergrid rig is never listed.** A rig swap away from an engineering rig (group 781) that breaks the fit's budget is dropped, not shown as a rejected row. The check is the budget after the swap, not a separate removal-only calculation.
- **Score is a mean.** The gain of each hacking and scanning figure the fit already has, plus speed and align, each equal weight. A figure the fit lacks earns no credit when a swap adds it.
- **No hull role unlock.** The ticket made it conditional; no hull role is only about exploring (Expedition Frigates already read as mining), so availability follows the fitted modules.
