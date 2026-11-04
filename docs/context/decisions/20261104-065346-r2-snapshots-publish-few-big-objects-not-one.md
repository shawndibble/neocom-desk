# Scope decisions — R2 snapshots publish few big objects, not one per type

_Recorded 2026-11-04._

- **Why: R2 bills writes per object, and one-object-per-type crossed the free tier.**
  Billing cycle Oct 12 – Nov 11 2026 reached 3.07M Class A operations against 1M
  included ($13.50, projected $17+, ~$25–30 a full cycle). Measured from the
  Actions logs: the 30-minute contract-offers publish rewrote ~3,300–3,850
  per-type objects every run (EVE Ref's archive changes every half hour and
  ~30% of ~11,700 types gain or lose a contract each time), ~170k writes a day;
  the daily open-prices run wrote ~19.1k (every type gains a day, so the
  skip-unchanged check of #5528 never fires); cost indices ~5.5k. The write
  count follows the number of objects, not the bytes, so the fix is fewer,
  bigger objects. Target: comfortably under 1M a cycle.
- **Contract offers: a type's index entry names the bundle shard holding it.**
  The bundle shards (20261023-072929) already hold every row with no type
  straddling two shards, so the per-type objects are dropped and shards shrink
  enough that a one-item search stays a small read. ~80 writes a run instead of
  ~3,500. Readers narrow a shard's rows to the asked types.
- **Open prices: `open-prices/shards/<typeId % 4096>.json`, `{ types: { <id>: … } }`.**
  ~5 types a shard, ~27 KB gzipped against ~5.5 KB for one type's object; R2
  has no egress fee, so the extra bytes cost nothing and 4,096 writes a day
  replace ~19k. Modulo keeps shards even; contiguous id ranges would group
  related items but leave dense ranges huge.
- **Readers first, writers after the readers reach production.** Scheduled jobs
  run from `develop` and write the one bucket production (`main`) also reads. A
  production client from before this change rejects an index naming shard
  objects (its name check) and would show contracts as unavailable, so the
  writer change merges only after the reader change is promoted. Until then
  the open-prices reader finds no shard (404) and reads the per-type object;
  once a shard exists it is the only source for its types.
- **Cost indices stay per-system for now** (~5.5k writes a day, ~170k a
  cycle); shard them the same way if the total nears the free tier again.
