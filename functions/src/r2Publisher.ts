/**
 * Publishes the offers snapshot to Cloudflare R2 (ADR 0019, issue #3745): the
 * bundle shards (every row, a few dozen content-addressed gzip objects; one
 * already in R2 is not uploaded again, though with ~30% of types changing per
 * publish nearly every shard changes), then `index.json` last, naming per
 * type the shard that holds it. The upload itself is injected (`R2Put`) so this
 * stays testable; `createR2Put` is the SigV4 implementation.
 *
 * Config: `R2_ENDPOINT` (https://<account>.r2.cloudflarestorage.com) and
 * `R2_BUCKET` in functions/.env; the access key pair
 * comes from the `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` secrets (GitHub repository secrets for the runner jobs).
 *
 * An R2 lifecycle rule deletes objects after a few days, which would also
 * delete a long-unchanged shard that `index.json` still names. So every
 * `REFRESH_AFTER_MS` the writer re-uploads every shard; the rule's age must
 * stay comfortably above that.
 */
import type { R2Put } from './r2Client.js';
import {
  R2_INDEX_KEY,
  buildBundleObjects,
  buildContractOfferR2Index,
  gzipObjectBody,
} from './contractOfferObjects.js';
import {
  COURIER_R2_INDEX_KEY,
  buildCourierContractR2Index,
  buildCourierObject,
} from './courierContractObjects.js';
import type { PublicContractOfferRow, PublicCourierContractRow } from './publicContracts.js';

export { createR2Get, createR2Put } from './r2Client.js';
export type { R2Config, R2Get, R2Put } from './r2Client.js';

export const REFRESH_AFTER_MS = 2 * 24 * 60 * 60_000;
/** A few dozen ~80 KB shards; 8 in flight is plenty. */
const UPLOAD_CONCURRENCY = 8;

/** What the writer remembers between publishes (one R2 state object). */
export interface R2PublishState {
  /** When every shard was last uploaded in one successful pass; `null` until one completes. */
  fullUploadAt: number | null;
  /** Shard names in R2 as of the last index written. */
  bundles: string[];
}

export interface R2PublishResult {
  /** Shards uploaded this publish. */
  uploaded: number;
  /** Shards already in R2 (named by content, so unchanged). */
  skipped: number;
  failed: number;
  indexWritten: boolean;
  /** First upload error message, so an auth or network fault is diagnosable from the log. */
  firstError: string | null;
  state: R2PublishState;
}

const OBJECT_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=31536000, immutable',
};
const INDEX_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=60',
};

async function runPool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function publishContractOffersToR2(args: {
  rows: readonly PublicContractOfferRow[];
  lastSyncedAt: number;
  previous: R2PublishState | null;
  now: number;
  put: R2Put;
}): Promise<R2PublishResult> {
  const { rows, lastSyncedAt, previous, now, put } = args;
  // `fullUploadAt === null` means the last refresh pass did not finish: upload every shard again.
  const refresh =
    previous === null ||
    previous.fullUploadAt === null ||
    now - previous.fullUploadAt >= REFRESH_AFTER_MS;
  const bundles = buildBundleObjects(rows);
  const parts = [...bundles.blueprints, ...bundles.others];
  const inR2 = new Set(refresh ? [] : (previous?.bundles ?? []));
  const changed = parts.filter((part) => !inR2.has(part.name));

  let uploaded = 0;
  let failed = 0;
  let firstError: string | null = null;
  await runPool(changed, UPLOAD_CONCURRENCY, async (part) => {
    try {
      await put(part.name, gzipObjectBody(part.body), OBJECT_HEADERS);
      uploaded += 1;
    } catch (error) {
      failed += 1;
      firstError ??= String(error);
    }
  });

  // Every name in the index must exist, so a failed shard holds the index back:
  // readers keep the previous index and its (still present) shards.
  let indexWritten = false;
  if (failed === 0) {
    try {
      await put(
        R2_INDEX_KEY,
        JSON.stringify(buildContractOfferR2Index(rows, bundles, lastSyncedAt)),
        INDEX_HEADERS
      );
      indexWritten = true;
    } catch (error) {
      // Next publish retries; the shards are already uploaded.
      firstError ??= String(error);
    }
  }

  return {
    uploaded,
    skipped: parts.length - changed.length,
    failed,
    indexWritten,
    firstError,
    state: indexWritten
      ? {
          bundles: parts.map((part) => part.name),
          fullUploadAt: refresh ? now : (previous?.fullUploadAt ?? now),
        }
      : {
          bundles: previous?.bundles ?? [],
          // A held-back refresh pass drops to `null`, so the next run uploads every shard again.
          fullUploadAt: refresh ? null : (previous?.fullUploadAt ?? null),
        },
  };
}

/** What the courier writer remembers between publishes (one Firestore doc). */
export interface CourierR2PublishState {
  /** Hash of the object that is in R2; `null` until one upload succeeds. */
  hash: string | null;
  /** When that object was last uploaded, for the lifecycle-refresh rule above. */
  uploadedAt: number | null;
}

export interface CourierR2PublishResult {
  uploaded: boolean;
  indexWritten: boolean;
  firstError: string | null;
  state: CourierR2PublishState;
}

/**
 * The courier snapshot is one object (see `courierContractObjects.ts`): upload
 * it when its hash changed or the refresh interval lapsed, then `index.json`.
 * A failed upload holds the index back, so readers keep the previous pair.
 */
export async function publishCourierContractsToR2(args: {
  rows: readonly PublicCourierContractRow[];
  lastSyncedAt: number;
  previous: CourierR2PublishState | null;
  now: number;
  put: R2Put;
}): Promise<CourierR2PublishResult> {
  const { rows, lastSyncedAt, previous, now, put } = args;
  const object = buildCourierObject(rows);
  const due =
    previous === null ||
    previous.hash !== object.hash ||
    previous.uploadedAt === null ||
    now - previous.uploadedAt >= REFRESH_AFTER_MS;

  let uploaded = false;
  let indexWritten = false;
  let firstError: string | null = null;
  let state: CourierR2PublishState = previous ?? { hash: null, uploadedAt: null };

  if (due) {
    try {
      await put(object.name, gzipObjectBody(object.body), OBJECT_HEADERS);
      uploaded = true;
      state = { hash: object.hash, uploadedAt: now };
    } catch (error) {
      firstError = String(error);
    }
  }
  if (!due || uploaded) {
    const index = buildCourierContractR2Index(object, rows.length, lastSyncedAt);
    try {
      await put(COURIER_R2_INDEX_KEY, JSON.stringify(index), INDEX_HEADERS);
      indexWritten = true;
    } catch (error) {
      firstError ??= String(error);
    }
  }
  return { uploaded, indexWritten, firstError, state };
}

/**
 * What one R2 publish means for the run (issue #4270). R2 is the only store,
 * so a failed upload or index write fails the run.
 */
export type R2PublishOutcome = { kind: 'complete' } | { kind: 'failed'; error: string };

export function r2PublishOutcome(result: {
  failed?: number;
  indexWritten: boolean;
  firstError: string | null;
}): R2PublishOutcome {
  const failed = result.failed ?? 0;
  if (failed === 0 && result.indexWritten) return { kind: 'complete' };
  return {
    kind: 'failed',
    error: `${failed > 0 ? `${failed} objects failed` : 'index not written'}; first error: ${result.firstError ?? 'unknown'}`,
  };
}

/**
 * What the contract-offers job does with both publishes' outcomes (issue
 * #4270): any failure fails the run, naming each snapshot that failed; the
 * archive fingerprint is stored only when both are complete, so a failed run
 * is retried next cycle rather than skipped as "archive
 * unchanged".
 */
export function publicContractsRunVerdict(
  courier: R2PublishOutcome,
  offers: R2PublishOutcome
): { error: string | null; storeFingerprint: boolean } {
  const failures = [
    courier.kind === 'failed' ? `courier: ${courier.error}` : null,
    offers.kind === 'failed' ? `offers: ${offers.error}` : null,
  ].filter((failure): failure is string => failure !== null);
  return {
    error:
      failures.length > 0 ? `Public contracts R2 publish failed — ${failures.join('; ')}` : null,
    storeFingerprint: courier.kind === 'complete' && offers.kind === 'complete',
  };
}
