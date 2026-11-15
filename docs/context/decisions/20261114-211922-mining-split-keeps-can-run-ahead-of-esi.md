# Scope decisions — Mining split keeps can run ahead of ESI (issue #6180)

_Recorded 2026-11-14 · issue #6180._

- **The Split dialog takes what the first Payee keeps or what moves, whichever the pilot knows.** Pilots know the first corp's share from the client; they used to reassign the whole day and split it back to type it.
- **Keeps may exceed what ESI reports yet, as a claim, with no new field.** The kept Assignment simply stores the client's figure. `computeOwnership` already counts every claim before handing a residual to the growth collector, so ore ESI reports later fills the claim first and only the excess reaches the new side. A capped "fill to N" field was ruled out: the claim _is_ the cap.
- **A claim needs the new side to collect, and never applies to a paid day.** The claim only means something if someone else takes what comes past it; a paid bill never grows (ADR 0024). The new side may start with no ore at all.
- **The new side collects later ore by default.** Sessions run in order, so ore reported after a split is nearly always from the moon the pilot moved on to.
