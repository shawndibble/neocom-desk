/**
 * Publishes the offers snapshot to Cloudflare R2 (ADR 0019, issue #3745): one
 * gzip object per item type, named by content hash and uploaded only when its
 * hash changed, then `index.json` last. The upload itself is injected (`R2Put`)
 * so this stays testable; `createR2Put` is the SigV4 implementation.
 *
 * Config: `R2_ENDPOINT` (https://<account>.r2.cloudflarestorage.com) and
 * `R2_BUCKET` in functions/.env; the access key pair
 * comes from the Firebase secrets `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
 *
 * An R2 lifecycle rule deletes objects after a few days, which would also
 * delete a long-unchanged type that `index.json` still names. So every
 * `REFRESH_AFTER_MS` the writer re-uploads every object; the rule's age must
 * stay comfortably above that.
 */
import { AwsClient } from 'aws4fetch';
import {
  R2_INDEX_KEY,
  buildContractOfferR2Index,
  buildTypeObjects,
  gzipObjectBody,
} from './contractOfferObjects.js';
import {
  COURIER_R2_INDEX_KEY,
  buildCourierContractR2Index,
  buildCourierObject,
} from './courierContractObjects.js';
import type { PublicContractOfferRow, PublicCourierContractRow } from './publicContracts.js';

export const REFRESH_AFTER_MS = 2 * 24 * 60 * 60_000;
/**
 * ~12k small PUTs, each dominated by round-trip latency rather than bandwidth,
 * so 8 in flight took minutes; 32 stays well inside R2's request limits and
 * Cloud Functions' socket and memory budget (bodies are ~450 bytes gzipped).
 */
const UPLOAD_CONCURRENCY = 32;
/** Well inside the 540 s function timeout, leaving room to persist state and write the index. */
export const UPLOAD_BUDGET_MS = 360_000;
/** Flush recorded hashes this often, so a killed run still leaves progress behind. */
export const PROGRESS_FLUSH_EVERY = 1000;

export type R2Put = (
  key: string,
  body: Buffer | string,
  headers: Record<string, string>
) => Promise<void>;

/** What the writer remembers between publishes (one Firestore doc). */
export interface R2PublishState {
  /** Hash of each type's objects that are in R2, by type id. */
  hashes: Record<string, string>;
  /** When every object was last uploaded in one successful pass; `null` until one completes. */
  fullUploadAt: number | null;
}

export interface R2PublishResult {
  uploaded: number;
  skipped: number;
  failed: number;
  /** Changed types not attempted because the time budget ran out; the next run resumes them. */
  remaining: number;
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

export interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createR2Put(config: R2Config): R2Put {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const base = `${config.endpoint.replace(/\/+$/, '')}/${config.bucket}`;
  return async (key, body, headers) => {
    const response = await client.fetch(`${base}/${key}`, { method: 'PUT', headers, body });
    if (!response.ok) throw new Error(`R2 PUT ${key} failed: ${response.status}`);
  };
}

async function runPool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
  /** Checked before each item; once true no further items start. Returns how many were started. */
  stop: () => boolean
): Promise<number> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop()) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return next;
}

export async function publishContractOffersToR2(args: {
  rows: readonly PublicContractOfferRow[];
  lastSyncedAt: number;
  previous: R2PublishState | null;
  now: number;
  put: R2Put;
  /** Stop starting uploads after this long (default `UPLOAD_BUDGET_MS`). */
  budgetMs?: number;
  /** Monotonic clock in ms; injected for tests. */
  clock?: () => number;
  /** Called with the hashes recorded so far every `PROGRESS_FLUSH_EVERY` uploads. */
  onProgress?: (state: R2PublishState) => Promise<void>;
}): Promise<R2PublishResult> {
  const { rows, lastSyncedAt, previous, now, put, onProgress } = args;
  const clock = args.clock ?? Date.now;
  const deadline = clock() + (args.budgetMs ?? UPLOAD_BUDGET_MS);
  const objects = buildTypeObjects(rows);
  // `fullUploadAt === null` means an earlier pass was partial: keep filling it
  // in from the recorded hashes rather than starting over.
  const refresh =
    previous === null ||
    (previous.fullUploadAt !== null && now - previous.fullUploadAt >= REFRESH_AFTER_MS);
  const completesFullPass = refresh || previous.fullUploadAt === null;
  const known = refresh ? {} : previous.hashes;

  const hashes: Record<string, string> = {};
  const changed = [];
  let skipped = 0;
  for (const object of objects) {
    const key = String(object.typeId);
    if (known[key] === object.hash) {
      hashes[key] = object.hash;
      skipped += 1;
    } else {
      changed.push(object);
    }
  }

  let uploaded = 0;
  let failed = 0;
  let firstError: string | null = null;
  const partialState = (): R2PublishState => ({
    hashes: { ...hashes },
    fullUploadAt: refresh ? null : (previous?.fullUploadAt ?? null),
  });
  const started = await runPool(
    changed,
    UPLOAD_CONCURRENCY,
    async (object) => {
      try {
        for (const part of object.parts)
          await put(part.name, gzipObjectBody(part.body), OBJECT_HEADERS);
        hashes[String(object.typeId)] = object.hash;
        uploaded += 1;
        if (onProgress && uploaded % PROGRESS_FLUSH_EVERY === 0)
          await onProgress(partialState()).catch(() => undefined);
      } catch (error) {
        failed += 1;
        firstError ??= String(error);
      }
    },
    () => clock() >= deadline
  );
  const remaining = changed.length - started;

  // Names in the index must all exist, so a failed type holds the index back:
  // readers keep the previous index and its (still present) objects.
  let indexWritten = false;
  if (failed === 0 && remaining === 0) {
    const index = buildContractOfferR2Index(rows, objects, lastSyncedAt);
    try {
      await put(R2_INDEX_KEY, JSON.stringify(index), INDEX_HEADERS);
      indexWritten = true;
    } catch (error) {
      // Next publish retries; the objects are already uploaded and recorded.
      firstError ??= String(error);
    }
  }

  return {
    uploaded,
    skipped,
    failed,
    remaining,
    indexWritten,
    firstError,
    state: {
      hashes,
      // A failed or budget-cut refresh pass drops to `null` so the next run resumes from the
      // recorded hashes instead of re-uploading everything every 30 minutes.
      fullUploadAt:
        failed === 0 && remaining === 0 && completesFullPass
          ? now
          : refresh
            ? null
            : (previous?.fullUploadAt ?? null),
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
