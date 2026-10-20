# Scope decisions — Collector books: source corporation and refinery identity (issue #4506)

_Recorded 2026-10-20 · issue #4506._

- **An absent `sourceCorporationId` means the book's own corporation.** No backfill: existing rows and books read as before, and the Firestore change is additive for the dev and production project they share. New rows are stamped with the corporation whose refinery recorded them.
- **A refinery is its structure id.** Observed rows, charges and entries stay keyed per structure id, so two refineries in one system on one day never merge, in the browser and in `functions/`. The label (officer label, structure name, learned system, feeder name plus id) is display only and never part of a key.
- **A refinery's system is learned by matching its entry against the miner's own ledger** (same character, day and ore); the most common system wins. Moon and system stay optional enrichment.
