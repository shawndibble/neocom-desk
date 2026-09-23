# Scope decisions — BPC Sourcing watches removed

_Recorded 2026-09-23._

- **BPC Sourcing's "Watch this search" is removed.** User request. Supersedes
  `20260912-103412-bpc-sourcing-watches-standalone-diff-contractid-re-fire.md`:
  the saved-search UI, `watches.ts`, `watchPoller.ts` and
  `engine/contracts/bpcWatch.ts` are gone, and the Foreground Poller no longer
  runs a second loop beside its per-Character registry. Dexie v16 drops the
  device-local `bpcSearchWatches` table. Feed rows already written stay
  readable: they store rendered text, so the
  `notifications.fired.bpcSearchWatchMatch.*` keys went with the feature.
- **BPC Sourcing, Item Offers and Market Browser gain a Jump Range filter,
  measured from the Current System.** The Current System is the active
  Character's ESI location, or a system the pilot picked by hand. A pick holds
  until ESI reports a _different_ system than it did when the pick was made
  (`effectiveCurrentSystem`, `engine/route/jumpRange.ts`). A row this app
  cannot place (a player structure, an unresolved location) drops out once a
  range is active, since an unknown distance cannot back "within 5 jumps". With
  no origin or no stargate snapshot the range filters nothing and says so,
  rather than reading as an empty result.
