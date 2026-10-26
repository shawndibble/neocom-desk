# Scope decisions — Alerts poller lists only due grants (nextPollAt) (issue #5236)

_Recorded 2026-10-26 · issue #5236._

- **`alertGrants.nextPollAt` (epoch ms) gates the poll listing.** The poller lists `status == active && nextPollAt <= now`, paged, instead of every active grant each run. An idle grant (nobody live wants anything it covers) is deferred by one guarded field write (guarded on the token blob, so a re-grant, which writes `0`, is never overwritten). Slow-cadence grants are not deferred: a write costs about three reads, so an hour's deferral saves nothing. Additive and backward-compatible: old code ignores the field. New grants and re-grants write `0`.
- **Idle grants are re-checked every 12 runs (3 h), hourly-slot aligned.** A write costs about three reads, so a shorter deferral saves nothing. Cost: a device that newly enables an alert on a grant that was idle can wait up to 3 h for the first push (was 15 min), and a notification that arrived before the device's latest hourly re-register (which restamps the wake cutoff) in that window is not pushed. Rules out waking the grant from `registerDevice` (a read per hourly re-register).
- **No jitter.** Slow-cadence devices poll on a run-slot boundary (`deviceCadence`), so `nextPollAt` is slot-aligned; jitter would push a grant past its slot and cost a run.
- **A daily full listing finds grants with no `nextPollAt`.** An inequality never matches a missing field, so once a day (run 12 of 96) every active grant is read, the missing ones are polled and stamped `0`. Covers pre-field grants and grants saved by an older function version.
- **Deploy:** `firebase deploy --only firestore:indexes` first, then functions.
