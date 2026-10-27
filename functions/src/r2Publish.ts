import { defineSecret } from 'firebase-functions/params';
import { info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import type { Firestore } from 'firebase-admin/firestore';
import {
  createR2Put,
  type R2Config,
  publishContractOffersToR2,
  publishCourierContractsToR2,
  r2PublishOutcome,
  type CourierR2PublishState,
  type R2PublishOutcome,
  type R2PublishState,
} from './r2Publisher.js';
import { SYSTEM_CONDITIONS_COLLECTION } from './lawlessSystems.js';
import type { PublicContractOfferRow, PublicCourierContractRow } from './publicContracts.js';

/** Doc under `systemConditions` holding what the R2 writer last published (issue #3745). */
const PUBLIC_CONTRACTS_R2_STATE_DOC = 'publicContractR2State';

/** Doc under `systemConditions` holding what the R2 courier writer last published (issue #3748). */
const PUBLIC_COURIERS_R2_STATE_DOC = 'publicCourierR2State';

export const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID');
export const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY');

/**
 * The R2 connection for jobs whose only store is R2 (public contracts, LP
 * offers, open prices): throws when the config is missing so the run fails
 * loudly.
 */
export function r2ConfigOrThrow(): R2Config {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint?.startsWith('https://') || !bucket) {
    throw new Error('R2_ENDPOINT (https) / R2_BUCKET not set');
  }
  return {
    endpoint,
    bucket,
    accessKeyId: R2_ACCESS_KEY_ID.value(),
    secretAccessKey: R2_SECRET_ACCESS_KEY.value(),
  };
}

/**
 * Publishes the offers snapshot to R2 (ADR 0019, issue #4270). Errors reading
 * the state doc are tolerated (a full re-upload is the worst case); upload and
 * index failures come back as the outcome, which the run turns into a throw.
 */
export async function publishOffersToR2(
  db: Firestore,
  config: R2Config,
  rows: readonly PublicContractOfferRow[],
  lastSyncedAt: number
): Promise<R2PublishOutcome> {
  const stateRef = db.collection(SYSTEM_CONDITIONS_COLLECTION).doc(PUBLIC_CONTRACTS_R2_STATE_DOC);
  const previous = await stateRef
    .get()
    .then((snap) => (snap.exists ? (snap.data() as R2PublishState) : null))
    .catch(() => null);
  const result = await publishContractOffersToR2({
    rows,
    lastSyncedAt,
    previous,
    now: Date.now(),
    put: createR2Put(config),
    onProgress: async (state) => {
      await stateRef.set(state);
    },
  });
  await stateRef.set(result.state);
  const outcome = r2PublishOutcome(result);
  const { uploaded, skipped, failed, remaining, indexWritten, bundlesWritten, firstError } = result;
  (outcome.kind === 'complete' && bundlesWritten ? logInfo : logWarn)(
    'public contract offers R2 publish',
    { uploaded, skipped, failed, remaining, indexWritten, bundlesWritten, firstError }
  );
  return outcome;
}

/** Same contract as `publishOffersToR2`, for the courier snapshot (issue #3748). */
export async function publishCourierToR2(
  db: Firestore,
  config: R2Config,
  rows: readonly PublicCourierContractRow[],
  lastSyncedAt: number
): Promise<R2PublishOutcome> {
  const stateRef = db.collection(SYSTEM_CONDITIONS_COLLECTION).doc(PUBLIC_COURIERS_R2_STATE_DOC);
  const previous = await stateRef
    .get()
    .then((snap) => (snap.exists ? (snap.data() as CourierR2PublishState) : null))
    .catch(() => null);
  const result = await publishCourierContractsToR2({
    rows,
    lastSyncedAt,
    previous,
    now: Date.now(),
    put: createR2Put(config),
  });
  await stateRef.set(result.state);
  const outcome = r2PublishOutcome(result);
  const { uploaded, indexWritten, firstError } = result;
  (outcome.kind === 'complete' ? logInfo : logWarn)('public courier contracts R2 publish', {
    uploaded,
    indexWritten,
    firstError,
  });
  return outcome;
}

/**
 * Runs one R2 publish, folding a thrown error (a state-doc write, say) into a
 * failed outcome so the other snapshot's publish still runs before the job fails.
 */
export async function settleR2Publish(
  publish: () => Promise<R2PublishOutcome>
): Promise<R2PublishOutcome> {
  try {
    return await publish();
  } catch (error) {
    return { kind: 'failed', error: String(error) };
  }
}
