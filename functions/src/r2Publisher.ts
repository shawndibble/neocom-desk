import { runPool } from './asyncPool.js';
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
const UPLOAD_CONCURRENCY = 8;

export interface R2PublishState {
  fullUploadAt: number | null;
  bundles: string[];
}

export interface R2PublishResult {
  uploaded: number;
  skipped: number;
  failed: number;
  indexWritten: boolean;
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

export async function publishContractOffersToR2(args: {
  rows: readonly PublicContractOfferRow[];
  lastSyncedAt: number;
  previous: R2PublishState | null;
  now: number;
  put: R2Put;
}): Promise<R2PublishResult> {
  const { rows, lastSyncedAt, previous, now, put } = args;
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
          fullUploadAt: refresh ? null : (previous?.fullUploadAt ?? null),
        },
  };
}

export interface CourierR2PublishState {
  hash: string | null;
  uploadedAt: number | null;
}

export interface CourierR2PublishResult {
  uploaded: boolean;
  indexWritten: boolean;
  firstError: string | null;
  state: CourierR2PublishState;
}

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
