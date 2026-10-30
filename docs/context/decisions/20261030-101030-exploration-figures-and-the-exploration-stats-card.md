# Scope decisions — Exploration figures and the Exploration stats card

_Recorded 2026-10-30._

- **Hacking strength is per site: Data and Relic.** An analyzer opens the sites of the skills it requires (Hacking: data, Archaeology: relic; an Integrated Analyzer needs both), so an Integrated → Data Analyzer swap names the relic strength it gives up. The best-of-all figure stays only inside Explore better's score; every line a pilot reads names data and relic.
- **Probe strength is the loaded probe's, as the engine leaves it** (launcher bonus, rigs, skills and hull folded in: 104 for a Sisters launcher and probe on an Astero). The launcher's own bonus is a figure too, because a fit often carries its probes in cargo and an empty launcher has no probe to measure.
- **A cloak's relock delay is shown; "can warp cloaked" is not yet.** It is a type effect (980) the engine's results do not carry; it needs the SDE build to bake it (#5625).
- **An Exploration card joins the stats column,** open by default, shown when the fit has an analyzer, a probe launcher or a scan array — not for a cloak alone: a bomber or recon is no explorer. Its header reads the best analyzer strength, else the probe strength, else the arrays' scan bonus. A figure the fit has none of is left out.
- **A cloak's relock delay is compared to a tenth of a second:** the Cloaking skill halves it, so 4.5 s and 5 s are different cloaks.
