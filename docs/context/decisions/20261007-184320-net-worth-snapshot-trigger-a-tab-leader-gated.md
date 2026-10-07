# Scope decisions — Net Worth Snapshot trigger: a Tab Leader-gated recorder mounted in Layout (issue #2865)

_Recorded 2026-10-07 · issue #2865._

- **The daily Net Worth Snapshot is written by a recorder component mounted in `Layout` (`features/netWorth/NetWorthSnapshotRecorder.tsx`), not by the Foreground Poller or the background sync sweep.** The poller only runs while the tab is visible and diffs notification events; the sweep reconciles Firestore and has no wallet/assets/orders reads. A recorder of its own stands in the `poller` Tab Leader election (only a visible leader writes) and takes a `neocom:netWorth` Web Lock so a handover cannot run two at once. It checks every 30 minutes, so a tab open past midnight UTC records the new day.
- **The once-a-day guard is the row itself.** A Character with a `${characterId}:${day}` row is not re-read; a Character missing the wallet, assets or orders permission, or whose fetch has no data, gets no row (a partial total would read as a crash in net worth).
- **Assets are priced at the chosen hub's sell minimum, falling back to the average price** where the hub trades nothing; PLEX stacks leave the asset value and hangar PLEX is priced at the global PLEX price in its own layer.
