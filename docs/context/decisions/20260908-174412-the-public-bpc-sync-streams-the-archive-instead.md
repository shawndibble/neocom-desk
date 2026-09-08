# Scope decisions — The public BPC sync streams the archive instead of buffering it

_Recorded 2026-09-08._

- **`syncPublicBpcContracts` had never once succeeded.** Every scheduled run
  between deploy and this change OOM'd at ~40 seconds — `Memory limit of 1024
MiB exceeded`, twice an hour, silently. The BPC Search tab's "No public BPC
  listings synced yet" was therefore accurate: the collection had no `meta`
  document because nothing had ever written one. Nothing was wrong on the
  client.

- **The archive was never the problem; the parse was.** The download is 6.2MB
  compressed and the two CSVs this feature reads unpack to 37MB. Parsing them
  whole cost **~1.1GB of heap**: `csv-parse` with `columns: true` builds one
  object per row carrying _every_ column in the file — 21 for `contracts.csv`,
  11 for `contract_items.csv`, against interfaces that declare 8 each — and
  both record arrays were live simultaneously because both parses were
  arguments to one call. ADR 0013's "~35MB of CSV text" measured the text and
  was correct; it just isn't the number that had to fit in memory.

- **So the sync streams, and the pure module grew per-row seams to let it.**
  `eligibleContractFrom` narrows one contract to the seven fields the join
  needs; `compactBpcItemRow` joins one item to an already-narrowed parent.
  `filterAndCompactBpcContracts` stays, rebuilt on those two, as the composed
  and fixture-testable statement of the whole join — the streaming pass in
  `index.ts` is the same logic with the arrays never materialised. Measured
  against the same live archive: **122,038 rows either way**, peak heap 1.1GB
  before and 67MB after.

- **Memory came down to 512MiB rather than up to 2GiB.** Raising the ceiling
  would have worked today and re-broken as EVE's contract volume grew, at
  double the memory for 48 runs a day. The streaming pass peaks near 150MB RSS
  and finishes in ~4s against a 300s timeout, so the smaller ceiling is now
  the honest one.

- **A reordered archive fails loudly instead of syncing nothing.** The single
  pass works only because EVE Ref lists `contracts.csv` before
  `contract_items.csv`, which is theirs to change, and an item row arriving
  before its lookup exists would produce an empty snapshot — indistinguishable
  from "nobody is selling any BPCs", which is exactly the failure this whole
  change exists to stop being silent. Wrong order now throws.

- **Reading stops after `contract_items.csv`.** It is entry 3 of 7; the
  remaining ~19MB is dynamic-item data this feature never reads. Abandoning
  the source skips decompressing it rather than decompressing and discarding
  it, as the previous pass did.

- **The client still downloads all 122k rows on open.** Out of scope here —
  this change is about a backend that never ran — but the payload is real and
  is worth its own decision.
