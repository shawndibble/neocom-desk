# Scope decisions — Public contract sync memory drops to 1GiB (issue #5108)

_Recorded 2026-10-25 · issue #5108._

- **`syncPublicContractOffers` runs at 1GiB, not 2GiB.** The Cloud Run `memory/utilizations` metric for the service, read on 2026-10-25 over the last 14 days (after the bundle-shard change of #4820), put the p99 at 35% of the 2GiB limit, about 720MiB. 1GiB leaves about 30% headroom. The 2GiB was sized for the Firestore row write that #4286 removed. This supersedes the "memory stays 2GiB" line of `20261025-015405`, which kept it only because the metric was unreadable then.
- **Rollback:** set `memory` back to `2GiB` and redeploy. Watch for `Memory limit exceeded` in the function's logs and for the R2 snapshot `Last-Modified` stopping its hourly advance; an earlier under-sized run OOM-looped silently.
