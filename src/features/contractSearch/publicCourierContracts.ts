import {
  loadR2Snapshot,
  type R2SnapshotRead,
  type R2SnapshotSource,
} from '@/features/contractSearch/r2Snapshot';
import { readR2CourierSnapshot } from '@/features/contractSearch/r2CourierSnapshot';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import { HOUR_MS } from '@/lib/age';

const SOURCE: R2SnapshotSource<PublicCourierContractRow> = {
  cacheKey: 'publicCourierContracts',
  staleAfterMs: HOUR_MS,
  read: readR2CourierSnapshot,
};

export function loadPublicCourierContracts(): Promise<R2SnapshotRead<PublicCourierContractRow>> {
  return loadR2Snapshot(SOURCE);
}
