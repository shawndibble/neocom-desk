# Scope decisions — Public contract snapshots are served from R2 only (issue #4270)

_Recorded 2026-10-18 · issue #4270. Supersedes ADR 0019's clause "The
Firestore chunks remain as the fallback until the R2 path has run in
production": the R2 path has run in production since #3745–#3748, so the
fallback is removed now._

- **R2 is the only store for both public contract snapshots.**
  `syncPublicContractOffers` no longer writes `publicContractOffers` (~124
  chunk docs + `meta`), `publicContractOffersIndex` or `publicCourierContracts`.
  That removes ~48 Firestore rewrites a day and, on the client's fallback path,
  40–75 MB reads. The job's own state docs in `systemConditions`
  (`publicContractR2State`, `publicCourierR2State`,
  `publicContractsArchiveFingerprint`, `publicContractTypeHashes`) stay.
- **An R2 publish failure fails the run.** A missing R2 config throws before
  the archive download. A failed object upload or `index.json` write throws
  after both snapshots have been attempted (courier first), so one failing does
  not skip the other. While Firestore was the source of truth the R2 publish
  was "additive, never throws"; with nothing else to serve readers, a silent
  failure would leave them on stale data with no alert.
- **The archive fingerprint is stored only after both publishes complete.** A
  failed run, or one cut short by the upload time budget, leaves it unstored,
  so the next run retries instead of skipping as "archive unchanged". A
  budget-cut run is logged as a warning, not thrown: its recorded hashes let
  the next run resume, which is the expected shape of a first run or a
  two-day refresh.
- **No client fallback to Firestore.** R2 unreachable or invalid with nothing
  cached reads as the existing "couldn't reach the contract index" state on
  the Items board, the Courier board and BPC Sourcing. These reads need no
  Firebase session, so the `ensureAnySession`/`isSyncConfigured` gating that
  existed only for Firestore is gone, along with the "needs the sync backend"
  empty states. Contract-backed blueprint sources are read once, not per
  Character.
- **A one-blueprint bundle is no longer flagged multi-type.** The whole
  Firestore read was the last path that saw a contract's non-blueprint lines
  (#1076). BPC Sourcing reads only blueprint types from R2, so a bundle of one
  blueprint plus ordinary items tallies as single-type. A bundle of two or more
  blueprint types is still flagged. This was already the R2 behaviour.
- **Firestore rules and data.** The three `match` blocks and the
  `publicContractOffersIndex` index override are removed; the implicit deny
  covers anything left behind. The three production collections are orphaned
  and are deleted by hand after the rules and function deploy.
