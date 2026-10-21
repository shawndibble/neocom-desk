# Scope decisions — Corp Tax Book: per-refinery miner rate (issue #4621)

_Recorded 2026-10-20 · issue #4621._

- **Rate order, most specific first: record, Miner, moon, refinery (`structure`), feeder, Guest, corp.** A per-refinery rate is keyed by structure id, because a moon owner's ledger-only rows never carry a moon id, so the per-moon rate cannot reach them. It sits right after moon: a refinery drills one moon at a time, so the two name the same rocks, and a book that already set a moon rate prices exactly as before. Supersedes the order in the 20261020-184600 decision. Dated-rate rules unchanged; officers set it in the book's settings like any other dated rate.
- **A moon owner sees none of it.** The per-refinery rate is a miner rate: it never reaches the moon owner's view or any moon owner mail.
