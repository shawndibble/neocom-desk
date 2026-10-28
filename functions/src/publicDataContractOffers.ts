/**
 * The public contract offers job for the GitHub Actions runner
 * (`scripts/public-data/contract-offers.mjs`, `.github/workflows/public-data-contract-offers.yml`).
 * It replaces the `syncPublicContractOffers` Cloud Function: same archive join, same R2 objects
 * (`contract-offers/`, the courier snapshot). The four records the function kept in Firestore
 * (archive fingerprint, type hashes, offers state, courier state) live in R2 objects under
 * `contract-offers-state/`, read through the S3 API so a skip never sees a stale CDN copy.
 * Touches no Firestore.
 */
import { measureContractTypeChanges, type ContractTypeHashes } from './contractTypeChanges.js';
import {
  accumulateRequestedSide,
  applyLineCounts,
  applyRequestedSide,
  compactContractOfferRow,
  courierContractFrom,
  eligibleContractFrom,
  emptyRequestedSide,
  isOutstandingCourierContract,
  type EligibleContract,
  type PublicContractOfferRow,
  type PublicCourierContractRow,
} from './publicContracts.js';
import {
  publishContractOffersToR2,
  publishCourierContractsToR2,
  publicContractsRunVerdict,
  r2PublishOutcome,
  type CourierR2PublishState,
  type R2PublishOutcome,
  type R2PublishState,
} from './r2Publisher.js';
import { createR2Get, createR2Put, r2ConfigFromEnv, type R2Get, type R2Put } from './r2Client.js';

const CONTRACT_OFFERS_STATE_PREFIX = 'contract-offers-state/';
export const ARCHIVE_FINGERPRINT_R2_KEY = `${CONTRACT_OFFERS_STATE_PREFIX}archive-fingerprint.json`;
export const TYPE_HASHES_R2_KEY = `${CONTRACT_OFFERS_STATE_PREFIX}type-hashes.json`;
export const OFFERS_STATE_R2_KEY = `${CONTRACT_OFFERS_STATE_PREFIX}offers.json`;
export const COURIERS_STATE_R2_KEY = `${CONTRACT_OFFERS_STATE_PREFIX}couriers.json`;

const STATE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

type ArchiveModule = Pick<
  typeof import('./publicContractsArchive.js'),
  'fetchArchiveFingerprint' | 'streamPublicContractsCsvs'
>;

export interface PublicContractOffersDeps {
  get: R2Get;
  put: R2Put;
  now?: () => number;
  /** Test seam: the archive fetch (loaded lazily, it pulls in the tar and bzip2 readers). */
  archive?: ArchiveModule;
}

/** A state read that fails is "cannot tell": a full re-upload is the worst case, never a failed run. */
async function readState<T>(get: R2Get, key: string): Promise<T | null> {
  try {
    return (await get(key)) as T | null;
  } catch (error) {
    console.warn('Contract offers state read failed', { key, error: String(error) });
    return null;
  }
}

function writeState(put: R2Put, key: string, value: unknown): Promise<void> {
  return put(key, JSON.stringify(value), STATE_HEADERS);
}

/** Folds a thrown error (a state write, say) into a failed outcome so the other snapshot still publishes. */
async function settle(publish: () => Promise<R2PublishOutcome>): Promise<R2PublishOutcome> {
  try {
    return await publish();
  } catch (error) {
    return { kind: 'failed', error: String(error) };
  }
}

async function publishOffers(
  deps: PublicContractOffersDeps,
  rows: readonly PublicContractOfferRow[],
  lastSyncedAt: number
): Promise<R2PublishOutcome> {
  const now = deps.now ?? Date.now;
  const previous = await readState<R2PublishState>(deps.get, OFFERS_STATE_R2_KEY);
  const result = await publishContractOffersToR2({
    rows,
    lastSyncedAt,
    previous,
    now: now(),
    put: deps.put,
    onProgress: (state) => writeState(deps.put, OFFERS_STATE_R2_KEY, state),
  });
  await writeState(deps.put, OFFERS_STATE_R2_KEY, result.state);
  const { uploaded, skipped, failed, remaining, indexWritten, bundlesWritten, firstError } = result;
  const outcome = r2PublishOutcome(result);
  (outcome.kind === 'complete' && bundlesWritten ? console.info : console.warn)(
    'Contract offers R2 publish',
    { uploaded, skipped, failed, remaining, indexWritten, bundlesWritten, firstError }
  );
  return outcome;
}

async function publishCouriers(
  deps: PublicContractOffersDeps,
  rows: readonly PublicCourierContractRow[],
  lastSyncedAt: number
): Promise<R2PublishOutcome> {
  const now = deps.now ?? Date.now;
  const previous = await readState<CourierR2PublishState>(deps.get, COURIERS_STATE_R2_KEY);
  const result = await publishCourierContractsToR2({
    rows,
    lastSyncedAt,
    previous,
    now: now(),
    put: deps.put,
  });
  await writeState(deps.put, COURIERS_STATE_R2_KEY, result.state);
  const { uploaded, indexWritten, firstError } = result;
  const outcome = r2PublishOutcome(result);
  (outcome.kind === 'complete' ? console.info : console.warn)('Courier contracts R2 publish', {
    uploaded,
    indexWritten,
    firstError,
  });
  return outcome;
}

/**
 * Publishes EVE Ref's public-contracts snapshot to R2; false when the archive has not changed
 * since the last complete publish. The fingerprint is read before the download and stored only
 * after a complete publish, so a refresh landing in between (or a failed publish) is picked up
 * next run. Throws when a publish failed.
 */
export async function publishPublicContractOffers(
  deps: PublicContractOffersDeps
): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const { fetchArchiveFingerprint, streamPublicContractsCsvs } =
    deps.archive ?? (await import('./publicContractsArchive.js'));
  const fingerprint = await fetchArchiveFingerprint();
  if (fingerprint !== null) {
    const stored = await readState<{ fingerprint?: unknown }>(deps.get, ARCHIVE_FINGERPRINT_R2_KEY);
    if (stored?.fingerprint === fingerprint) {
      console.info('Contract offers sync skipped: archive unchanged', { fingerprint });
      return false;
    }
  }
  const nowMs = now();
  const eligibleContracts = new Map<string, EligibleContract>();
  const rows: PublicContractOfferRow[] = [];
  const courierRows: PublicCourierContractRow[] = [];
  // An entry per contract asking for something in return; `contract_items.csv` is one stream, so a
  // requested line can arrive before or after the offered one. Fold as it passes, patch `rows` after.
  const requestedSide = emptyRequestedSide();
  let outstandingCourierContracts = 0;

  await streamPublicContractsCsvs({
    onContract: (record) => {
      const eligible = eligibleContractFrom(record, nowMs);
      if (eligible) {
        eligibleContracts.set(record.contract_id, eligible);
        return;
      }
      if (isOutstandingCourierContract(record, nowMs)) outstandingCourierContracts += 1;
      const courier = courierContractFrom(record, nowMs);
      if (courier) courierRows.push(courier);
    },
    onItem: (record) => {
      accumulateRequestedSide(record, eligibleContracts, requestedSide);
      const contract = eligibleContracts.get(record.contract_id);
      if (!contract) return;
      const row = compactContractOfferRow(record, contract);
      if (row) rows.push(row);
    },
  });
  applyRequestedSide(rows, requestedSide);
  applyLineCounts(rows);

  // Outstanding against published courier rows is the only tell of rows dropped for a blank
  // endpoint, reward or volume (EVE Ref leaving a column empty); both counts share one gate.
  console.info('Contract offers sync', {
    eligibleContracts: eligibleContracts.size,
    rowCount: rows.length,
    outstandingCourierContracts,
    courierRowCount: courierRows.length,
  });
  eligibleContracts.clear();

  // Telemetry only: how many types change per publish. A failure must not fail the publish.
  let typeHashes: ContractTypeHashes | null = null;
  try {
    const stored = await readState<{ hashes?: ContractTypeHashes }>(deps.get, TYPE_HASHES_R2_KEY);
    const previousHashes = stored?.hashes ?? null;
    const measured = measureContractTypeChanges(rows, previousHashes);
    typeHashes = measured.hashes;
    console.info('Contract type changes', { ...measured.stats, firstRun: previousHashes === null });
  } catch (error) {
    console.warn('Contract type change measurement failed', { error: String(error) });
  }

  const lastSyncedAt = now();
  // Courier first: one small object, so a slow offers upload cannot starve it of the time budget.
  const courier = await settle(() => publishCouriers(deps, courierRows, lastSyncedAt));
  const offers = await settle(() => publishOffers(deps, rows, lastSyncedAt));
  if (typeHashes !== null) {
    await writeState(deps.put, TYPE_HASHES_R2_KEY, { hashes: typeHashes, updatedAt: now() }).catch(
      (error) => console.warn('Contract type hashes write failed', { error: String(error) })
    );
  }
  const verdict = publicContractsRunVerdict(courier, offers);
  if (verdict.error !== null) throw new Error(verdict.error);
  if (fingerprint !== null && verdict.storeFingerprint) {
    await writeState(deps.put, ARCHIVE_FINGERPRINT_R2_KEY, { fingerprint, updatedAt: now() });
  }
  return true;
}

export async function runPublicContractOffers(
  env: Record<string, string | undefined>
): Promise<void> {
  const config = r2ConfigFromEnv(env);
  await publishPublicContractOffers({ get: createR2Get(config), put: createR2Put(config) });
}
