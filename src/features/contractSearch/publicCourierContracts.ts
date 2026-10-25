/**
 * Reads the Public Courier Contracts snapshot (issue #909) whole — every
 * outstanding public courier contract as a route and a fee — for the
 * Contracts page's Courier tab (issue #910).
 *
 * Far smaller than the offers snapshot: ADR 0013's live pull put courier and
 * loan contracts together under 620 against ~370k offer rows, so it is one R2
 * object (`r2CourierSnapshot.ts`, ADR 0019). That is why the panel reads it on
 * mount rather than on the first Courier click — deferring it would buy
 * nothing and cost a fetch on the way in. R2 is the only store (issue #4270):
 * unreachable with nothing cached reads as no snapshot, which the panel shows
 * as "unavailable". It is read *separately* from the offers snapshot, though:
 * see `ContractSearchPanel.tsx` for why pairing the two was the wrong trade.
 */
import {
  loadR2Snapshot,
  type R2SnapshotRead,
  type R2SnapshotSource,
} from '@/features/contractSearch/r2Snapshot';
import { readR2CourierSnapshot } from '@/features/contractSearch/r2CourierSnapshot';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';

const SOURCE: R2SnapshotSource<PublicCourierContractRow> = {
  /** Its own key: one payload shape per entry. */
  cacheKey: 'publicCourierContracts',
  /** Published by the same job as the offers snapshot, so the same window. */
  staleAfterMs: 60 * 60_000,
  read: readR2CourierSnapshot,
};

export function loadPublicCourierContracts(): Promise<R2SnapshotRead<PublicCourierContractRow>> {
  return loadR2Snapshot(SOURCE);
}
