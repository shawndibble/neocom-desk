# Scope decisions — Public contract sync runs hourly, memory stays 2GiB (issue #5066)

_Recorded 2026-10-25 · issue #5066._

- **`syncPublicContractOffers` runs every 60 minutes, not 30.** It was about 70% of billable function time. The client's snapshot stale window (`SNAPSHOT_PUBLISH_INTERVAL_MS`) is now 60 minutes to match. A published snapshot can now be up to about 90 minutes behind EVE Ref. This supersedes the "keeps its 30-minute tick" line of `20261008-082448`.
- **Memory stays 2GiB.** The Cloud Run memory metric could not be read here and no real-archive RSS was measured, so lowering to 1GiB would be a guess; an earlier under-sized run OOM-looped silently. Lowering it is a separate change once a peak is measured.
