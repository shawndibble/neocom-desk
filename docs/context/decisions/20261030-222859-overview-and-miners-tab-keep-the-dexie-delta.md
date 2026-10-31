# Scope decisions — Overview and Miners tab keep the Dexie delta, not a windowed open-days read (issue #5718)

_Recorded 2026-10-30 · issue #5718._

- **The Overview, Miners tab and health strip keep loading `observed` through the ADR 0031 Dexie delta.** A windowed `date >= from` query has no copy to ride, so it re-reads every open row on every open: warm cost is the open set, against 0 (stamp unchanged) or only the changed rows (delta) today. It only wins cold, which is a device's first open. Measured by `observedRead.cost.test.ts` (30 days x 10 rows, 7 open days): cold 300 vs 70; warm unchanged 0 vs 70; warm after a sync 10 vs 70. The ticket's rule "no path reads more than today on a warm device" rules the window out. A windowed Dexie copy would need its own invalidation when a Miner's window start moves earlier, and is #5260's decision.
- **Pricing stays as is.** Prices are static per-type objects (`loadStoredOpenPrices`), not Firestore reads, so pricing only open days saves no Firestore read (at most an HTTP fetch per ore type mined only on closed days), and the whole-book view also prices closed days for the Extractions tab.
