# Scope decisions — Explore better scores by family: hacking adds up per analyzer (issue #5572)

_Recorded 2026-10-29 · issue #5572._

- **Explore better's score is the mean of the families the fit has, each gained on its own.** Hacking (a fit with an analyzer), Scanning (a fit with a scan figure) and Mobility (always: the mean of speed and align). Averaging every figure flat let two Polycarbon rigs (+0.027) beat a +18% strength rig (+0.030 diluted) on the Astero.
- **Hacking adds up: the sum, over the fit's analyzers (paired by position), of the relative gain in strength, coherence and cycles a second.** A rig lifts one figure of one analyzer, so a mean over the figures it leaves alone (and over the analyzers it does not touch) buried it: measured on the Astero, the mean gave Memetic Algorithm Bank I 0.005 against Polycarbon Engine Housing II 0.021, and a mean could never let a strength rig beat a speed module of equal relative gain. Summed, a Data rig plus a Relic rig gains more than either alone, and a figure or analyzer the swap loses counts -1 per figure (an analyzer is -3). Scanning stays the mean of the scan figures present.
- **`ExploreStats.analyzers` lists every fitted, online analyzer; `hacking` stays the best one for the display lines.** `exploreFigures` is gone: nothing else read it.
