# Scope decisions — generalized public-contract snapshot schema and sizing (issue #906)

_Recorded 2026-09-12 · issue #906._

- **Only the `is_blueprint_copy` filter is dropped; `is_included` stays.** ADR
  0013's join drops an item line for two independent reasons — it isn't a
  blueprint copy, and it isn't offered for sale (`is_included=false` means the
  contract issuer _wants_ that item). #906 generalizes the item type, not the
  direction of the exchange: the snapshot answers "what can I buy", and a line
  the issuer is asking for is not an offer at any price. This also keeps the
  volume on the ticket's own ~3x estimate, which is the number the chunk size
  and function memory below are sized against; carrying wanted lines too would
  push past it. Rules out, for now, a "who is buying X" search — #908's
  Contracts Search tab should revisit this deliberately if it wants to show a
  contract's full both-sides contents, since that changes the sizing.
- **A second collection and a second row shape, not a widened
  `BpcContractRow`.** `publicContractOffers` is written by a new
  `syncPublicContractOffers`; `publicBpcContracts` and `syncPublicBpcContracts`
  are behaviourally untouched and keep backing BPC Sourcing until #907 moves
  it over. The cost is that the EVE Ref archive is fetched twice per 30-minute
  cycle. That is accepted as the expand half of an expand/contract with a
  scheduled end, rather than building a shared fetch that #907 would delete.
- **ME/TE/runs are omitted from a non-blueprint row rather than zeroed.**
  `Number('')` is `0`, not `NaN`, and a plain item line leaves all three CSV
  columns blank. Converting unconditionally would write `me: 0, te: 0,
runs: 0` onto roughly two thirds of the snapshot — bytes against the 1MiB
  doc limit, and an "ME 0" filter that matches every ore stack in New Eden.
  Copy-ness is carried by an explicit `isBlueprintCopy?: true`, present only
  when true, so a reader asks for the flag instead of inferring it from
  `runs`. The flag means _copy_: a blueprint original carries
  `is_blueprint_copy=false` and `runs=-1`, so it gets no flag and no `runs`
  — but its ME/TE is kept, because a researched BPO's research level is real
  information a buyer pays for and dropping it would need a re-sync to
  recover. Presence of `me`/`te` therefore means "a blueprint of some kind";
  `isBlueprintCopy` means "a copy specifically".
- **3,000 rows/chunk, against the blueprint snapshot's 2,000.** The blueprint
  snapshot measured ~185 bytes/row; a blueprint row here carries the extra
  `isBlueprintCopy` field, so ~210 bytes/row is the expected blueprint case
  and a chunk of nothing but blueprints is ~615KB — under two thirds of the
  1MiB limit, with most rows (plain items, no ME/TE/runs) smaller than that.
  A unit test measures the _widest_ row the shape can produce and asserts a
  full chunk of them still fits, rather than pinning a byte constant that
  would go stale the moment a field is added. The
  binding constraint is the free tier's 20,000 writes/day, which is the
  _project's_ budget: `dispatchProjections` runs 288x/day and the blueprint
  sync 48x/day alongside. ~370k rows at 3,000/chunk is ~124 docs x 48 runs ≈
  6.0k writes/day, plus ~3.0k for the blueprint sync — under half the budget,
  where reusing 2,000 would have spent ~8.9k on this job alone. Rules out
  going larger (4,000 rows ≈ 740KB is too close to the doc limit to absorb a
  row-shape change later).
- **Memory 2GiB / timeout 540s, provisioned rather than measured.** No local
  or CI path exercises this function against the live 37MB archive, so this is
  reasoned from the one hard datapoint ADR 0013 recorded: a 512MiB ceiling
  died at 527MiB _during the write_ with ~122k rows, having survived the
  streaming parse. The ceiling therefore scales with the retained rows and
  their encoding — exactly what triples here — so 1GiB is not safe at ~370k
  rows. The asymmetry decides it: under-provisioning reproduces a failure this
  project has already had (every scheduled run OOM-looping silently after
  deploy), while over-provisioning costs pennies on a 48-runs/day cron. The
  validation checkpoint is deliberate and cheap: the function logs
  `rowCount`, so the first live runs say what the real volume is and these
  numbers can come down.
- **The collection is `publicContractOffers`, not `publicContractItems`.**
  `src/features/bpcContracts/publicContractItems.ts` already exists and is
  something else entirely — a per-contract, on-open ESI read of one contract's
  items. Two things named the same, one a live single-contract fetch and one a
  twice-hourly 370k-row bulk snapshot, is how #907 gets wired to the wrong
  data path. "Offer" is already the glossary's word for one for-sale row in
  this snapshot, so it names the thing and disambiguates in one move.
- **A fourth Cloud Scheduler job is accepted.** ADR 0013 budgeted its own job
  against the 3 free per billing account (`dispatchProjections`,
  `purgeNotificationFeed`, `syncPublicBpcContracts`), and running the two
  syncs side by side spends a fourth. It costs cents a month and reverts to 3
  when #907 retires the blueprint-only sync — the alternative, folding both
  snapshots into one scheduled function, couples an expand step to the
  contract step that is supposed to be able to fail independently.
