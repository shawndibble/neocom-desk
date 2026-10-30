# Scope decisions — A module swap names every figure it changes

_Recorded 2026-10-30._

- **One list of what a swap changes, `swapChanges`: the stats-panel fields plus the role figures.** The Variations table and its CSV, and Improve's Gives up, read it, so they name the same things. A Sisters Core Probe Launcher → Core Probe Launcher I or a Zeugma → Ligature swap read as "CPU only"; a remote repairer, burst or hauler hold swap said nothing at all.
- **Improve's Gives up names every role figure the swap makes worse,** not only weapon reach and mining yield. No downside means nothing the row shows gets worse (issue #5098), and these are shown.
- **New stat fields: tackle (points, longest point and web reach, strongest web), one strength per EWAR kind (jam, damp, disruptor, painter: unlike units never summed), neut, nos and cap transfer, drone control range, mining residue, and the explore figures (hacking strength, coherence, cycle, scan bonuses).** Marked `hideWhenNone`: Fitting Compare drops the row while every Fitting is at zero, and for a lower-is-better one (analyzer cycle, residue) a change to or from zero is neither better nor worse, so a first analyzer is not "a slower hack". Display only: none joins `GAIN_METRICS`, so What to Train and Best overall rank exactly as before.
- **A role figure with several items (turret optimal and missile range, several bursts) reports its loss on a swap** (`roleSwapChanges`) where What to Train, for which a level never cuts, keeps reporting the gain.
- **An Improve row lists the role figures a swap raises,** and a goal's worded lead (Tackle, EWAR, Transfer, a role lead) claims the stats it already shows, so nothing reads twice.
- **Sensor strength is no longer Compare-only:** an ECCM or Sensor Booster swap is about it. The cargo row stays Compare-only; a hauler's hold comes through the hold role (unarmed fits), and a warship's hold is no swap's question.
- **Probe strength, analyzer data/relic capability, cloak covert warp and the Exploration card are the next step,** not this one: they need figures the engine does not compute yet.
