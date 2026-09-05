# Scope decisions (round 47) — Optimize remaps / Optimize at markers become Accept/Reject Modals

_Recorded 2026-09-04._

- **This reverses round 17's decision that "Optimize remaps" and "Optimize
  at markers" stay inline while only "Suggest reorder" gets a Modal.** That
  round's reasoning was sound at the time — a remap result was "read-only
  findings to consult, not a decision to commit" — but user feedback asked
  for the same Accept/Reject pattern "Suggest reorder" already has, so both
  now get one too. The Modal opens on every click, matching "Suggest
  reorder"'s own Modal, which opens unconditionally even when reordering
  finds nothing to improve — the first draft of this round gated the Modal
  on a `saves` verdict and kept the other outcomes inline, but that read
  the request narrower than intended and was corrected before merge. A
  `saves` verdict gets the figure, its segments, and Accept/Reject; every
  other verdict (`noRemapsAvailable` / `markersAtEnd` / `noGain`) gets its
  explanatory text inside the same Modal, with a single `common.close`
  dismiss action instead of Accept/Reject, since there is nothing to accept.
  The beside-the-button toast (#222) still fires alongside the Modal for
  every verdict, same as "Suggest reorder"'s toast + Modal pairing.
- **"Optimize at my markers"' Accept round-trips the plan's own markers
  through the same segments-to-markers conversion "Optimize remaps" uses to
  turn a search result into markers** (`applySegmentsAsMarkers`, shared by
  both flows). This is deliberate, not an oversight of the conversion's
  edge cases: `segmentsToMarkers` can snap a segment boundary that straddles
  an entry to the entry ahead of it, and `optimizeAtMarkers` dedupes cut
  points that land on the same optimizer step — so Accept here is usually a
  no-op but can, on request, tidy markers that a later plan edit left
  redundant. The user asked for this explicitly, aware of the snap/merge
  edge cases, over the alternative (a single read-only "Close" button) —
  recorded here so a future reader does not mistake the round-trip for a
  bug.
- **Both preview Modals reuse `plans.remapAccept`/`plans.remapReject`**
  ("Accept"/"Reject"), not `plans.reorderAccept`/`plans.reorderReject` —
  new keys rather than a rename, so the working, tested reorder Modal is
  untouched.
- **The now-unreachable "Apply as markers" button and its "Markers applied"
  confirmation are removed**, not left dead: Accept in the new Modal already
  performs that write and closes immediately, exactly like "Suggest
  reorder"'s Accept, so nothing renders the old confirmation text again.
