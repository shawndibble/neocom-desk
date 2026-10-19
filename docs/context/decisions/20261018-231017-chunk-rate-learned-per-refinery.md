# Scope decisions — Chunk rate learned per refinery (issue #4070)

_Recorded 2026-10-18 · issue #4070._

- **A refinery's chunk rate is the median of its last five measured cycles.** A cycle is measured when its Extraction has ExtractionStarted ore: notified m³ over hours from extraction start to chunk arrival. A median, not the latest, so one odd cycle does not swing later estimates; five cycles follow a rig change within a few cycles. Rules out latest-only and all-time averages.
- **The measured rate is derived from the book's stored Extractions, not stored as its own field.** The Extractions already persist the notified ore and times, so deriving needs no new Firestore field, rule or callable, can never disagree with the data, backfills existing books, and the scheduled server sync (#4068) feeds it for free by writing Extractions. Rules out a per-structure rate document and a server mirror.
- **Estimate precedence is measured, then the book's manual rate, then 30,000 m³/h.** The moon page and Settings both name the rate used and, for a measured one, the cycle count.
