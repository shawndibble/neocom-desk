# Scope decisions — Fittings Load reads killmail hashes from zKillboard's API (issue #1541)

_Recorded 2026-09-24 · issue #1541._

- **A zKillboard link Loads by asking zKillboard's public `killID` API for the killmail hash, then reading the victim from ESI.** A zKillboard URL carries only the id, and ESI needs id + hash. This makes zKillboard a runtime dependency of Load (browser fetch, no custom headers); ESI killmail URLs that already carry the hash skip it. Killmail Load sums destroyed + dropped quantities, since the fit is what was lost and what survived.
