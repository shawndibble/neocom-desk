import { setTimeout as sleep } from 'node:timers/promises';
import { error as logError, info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import { firestore } from './firestore.js';
import { LP_CORP_STATION_SYSTEMS } from './data/lpCorpStationSystems.js';
import { LP_STORE_REQUEST_GAP_MS, fetchLpStoreRows } from './lpOffersSnapshot.js';
import { createR2Get, createR2Put, publicContractsRunVerdict } from './r2Publisher.js';
import {
  publishCourierToR2,
  publishOffersToR2,
  r2ConfigOrThrow,
  settleR2Publish,
} from './r2Publish.js';
import { measureContractTypeChanges, type ContractTypeHashes } from './contractTypeChanges.js';
import { SYSTEM_CONDITIONS_COLLECTION } from './lawlessSystems.js';
import {
  accumulateRequestedSide,
  applyRequestedSide,
  emptyRequestedSide,
  compactContractOfferRow,
  courierContractFrom,
  eligibleContractFrom,
  isOutstandingCourierContract,
  type EligibleContract,
  type PublicContractOfferRow,
  type PublicCourierContractRow,
} from './publicContracts.js';
import { publishLpStoreOffersToR2 } from './r2DailySnapshots.js';
import {
  INDUSTRY_SYSTEMS_URL,
  parseCostIndices,
  writeCostIndicesToR2,
} from './costIndicesSnapshot.js';
import { runWorkbenchSync } from './workbenchFits.js';
import { r2WorkbenchHulls, workbenchFitsStore } from './workbenchFitsStore.js';
import { PUBLIC_HOST_USER_AGENT } from './marketHistoryJob.js';

/** Doc under `systemConditions` holding the archive version the last publish was built from. */
const PUBLIC_CONTRACTS_ARCHIVE_FINGERPRINT_DOC = 'publicContractsArchiveFingerprint';

/** Doc under `systemConditions` holding the last publish's per-type content hashes (issue #3744). */
const PUBLIC_CONTRACTS_TYPE_HASHES_DOC = 'publicContractTypeHashes';

/** Body of syncPublicContractOffers (see its doc in index.ts). */
export async function runSyncPublicContractOffers(): Promise<void> {
  // Skip the whole run when EVE Ref has not published a new archive since
  // the last publish. The fingerprint is read before the download and stored
  // only after a complete R2 publish, so a refresh landing in between (or a
  // failed publish) is picked up next run rather than lost. An unreadable fingerprint always syncs.
  // R2 is the only store, so a missing config fails before the download.
  const r2Config = r2ConfigOrThrow();
  const { fetchArchiveFingerprint, streamPublicContractsCsvs } =
    await import('./publicContractsArchive.js');
  const db = firestore();
  const fingerprintRef = db
    .collection(SYSTEM_CONDITIONS_COLLECTION)
    .doc(PUBLIC_CONTRACTS_ARCHIVE_FINGERPRINT_DOC);
  const fingerprint = await fetchArchiveFingerprint();
  if (fingerprint !== null) {
    // A failed read just means "cannot tell": sync rather than fail the run.
    const stored = await fingerprintRef
      .get()
      .then((snap) => snap.data()?.fingerprint as unknown)
      .catch(() => null);
    if (stored === fingerprint) {
      logInfo('public contract offers sync skipped: archive unchanged', { fingerprint });
      return;
    }
  }
  const nowMs = Date.now();
  const eligibleContracts = new Map<string, EligibleContract>();
  const rows: PublicContractOfferRow[] = [];
  const courierRows: PublicCourierContractRow[] = [];
  // Keyed the same as `eligibleContracts` (raw CSV `contract_id`), and just
  // as small — an entry per contract asking for something in return, not a
  // second copy of `contract_items.csv`. `contract_items.csv` is a single
  // stream (see publicContractsArchive.ts), so a requested line can arrive
  // before or after the same contract's offered line; folding every line
  // as it passes and patching `rows` once the stream ends (below) gets
  // `requestedSideByContract`'s answer without a second pass or buffering
  // the line-by-line records.
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

  // `outstandingCourierContracts` against `courierRowCount` is the only
  // thing that tells an empty courier snapshot apart from one whose rows were
  // all dropped for a blank endpoint, reward or volume — the same reason
  // publicContractsArchive.ts throws on a reordered archive rather than
  // publishing silence. The two counts share a gate
  // (`isOutstandingCourierContract`), so expiry and contract type are already
  // excluded from both and cannot open a gap: any gap at all is EVE Ref
  // leaving a column blank that `courierContractFrom` requires.
  logInfo('public contract offers sync', {
    eligibleContracts: eligibleContracts.size,
    rowCount: rows.length,
    outstandingCourierContracts,
    courierRowCount: courierRows.length,
  });

  // The lookup is dead once the join is done, and it is ~50k objects the
  // publish would otherwise be holding alongside the rows.
  eligibleContracts.clear();
  // Sizes the R2 per-type writer (ADR 0019): how many types change per
  // publish. Telemetry only — a failure here must not fail the publish.
  const typeHashesRef = db
    .collection(SYSTEM_CONDITIONS_COLLECTION)
    .doc(PUBLIC_CONTRACTS_TYPE_HASHES_DOC);
  let typeHashes: ContractTypeHashes | null = null;
  try {
    const previousHashes = await typeHashesRef
      .get()
      .then((snap) => (snap.data()?.hashes as ContractTypeHashes | undefined) ?? null)
      .catch(() => null);
    const measured = measureContractTypeChanges(rows, previousHashes);
    typeHashes = measured.hashes;
    logInfo('public contract type changes', {
      ...measured.stats,
      firstRun: previousHashes === null,
    });
  } catch (err) {
    logWarn('public contract type change measurement failed', { error: String(err) });
  }
  const lastSyncedAt = Date.now();
  // Courier first: one small object, so a slow offers upload cannot starve it
  // of the time budget. Both run before either failure is thrown.
  const courier = await settleR2Publish(() =>
    publishCourierToR2(db, r2Config, courierRows, lastSyncedAt)
  );
  const offers = await settleR2Publish(() => publishOffersToR2(db, r2Config, rows, lastSyncedAt));
  if (typeHashes !== null) {
    await typeHashesRef
      .set({ hashes: typeHashes, updatedAt: Date.now() })
      .catch((err) => logWarn('public contract type hashes write failed', { error: String(err) }));
  }
  // R2 is the only store (issue #4270): see `publicContractsRunVerdict`.
  const verdict = publicContractsRunVerdict(courier, offers);
  if (verdict.error !== null) throw new Error(verdict.error);
  if (fingerprint !== null && verdict.storeFingerprint) {
    await fingerprintRef.set({ fingerprint, updatedAt: Date.now() });
  }
}

const WORKBENCH_FETCH_BUDGET_MS = 360_000;
const WORKBENCH_REQUEST_GAP_MS = 250;

/** Body of syncWorkbenchFits (see its doc in index.ts). */
export async function runSyncWorkbenchFits(): Promise<void> {
  const r2 = r2ConfigOrThrow();
  const db = firestore();
  const hulls = r2WorkbenchHulls({ get: createR2Get(r2), put: createR2Put(r2) });
  const result = await runWorkbenchSync({
    store: workbenchFitsStore(db, hulls),
    fetchJson: async (url) => {
      const response = await fetch(url, {
        headers: { 'User-Agent': PUBLIC_HOST_USER_AGENT, Accept: 'application/json' },
      });
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      return { status: response.status, retryAfter: response.headers.get('Retry-After'), body };
    },
    now: Date.now,
    sleep,
    budgetMs: WORKBENCH_FETCH_BUDGET_MS,
    requestGapMs: WORKBENCH_REQUEST_GAP_MS,
  });
  logInfo('EVE Workbench fits sync', { ...result });
}

const LP_STORE_MAX_FAILED_SHARE = 0.1;

/** Body of syncLpStoreOffers (see its doc in index.ts). */
export async function runSyncLpStoreOffers(): Promise<void> {
  // Before the ~170-request crawl, so a missing R2 config fails fast.
  const r2 = r2ConfigOrThrow();
  const { rows, failed } = await fetchLpStoreRows({
    corporations: LP_CORP_STATION_SYSTEMS,
    fetchJson: async (url) => {
      const response = await fetch(url, {
        headers: {
          'User-Agent': PUBLIC_HOST_USER_AGENT,
          'X-User-Agent': PUBLIC_HOST_USER_AGENT,
          'X-Compatibility-Date': '2026-08-01',
          Accept: 'application/json',
        },
      });
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      return { status: response.status, retryAfter: response.headers.get('Retry-After'), body };
    },
    sleep,
    requestGapMs: LP_STORE_REQUEST_GAP_MS,
  });
  logInfo('LP store offers sync', { corporations: rows.length, failed: failed.length });
  if (rows.length === 0 || failed.length > Math.max(1, rows.length * LP_STORE_MAX_FAILED_SHARE)) {
    logError('LP store offers sync skipped publishing', { failed });
    return;
  }
  await publishLpStoreOffersToR2(rows, Date.now(), createR2Put(r2));
  logInfo('LP store offers published to R2', { corporations: rows.length });
}

/** Body of the cost index half of syncLpStoreOffers (see its doc in index.ts). */
export async function runSyncCostIndices(): Promise<void> {
  const r2 = r2ConfigOrThrow();
  const response = await fetch(INDUSTRY_SYSTEMS_URL, {
    headers: {
      'User-Agent': PUBLIC_HOST_USER_AGENT,
      'X-User-Agent': PUBLIC_HOST_USER_AGENT,
      'X-Compatibility-Date': '2026-08-01',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`industry systems: HTTP ${response.status}`);
  const indices = parseCostIndices(await response.json());
  const systems = Object.keys(indices).length;
  // An empty list would stamp nothing useful; fail loudly and try again tomorrow.
  if (systems === 0) throw new Error('industry systems: no systems parsed');
  const date = new Date().toISOString().slice(0, 10);
  const result = await writeCostIndicesToR2(
    [{ date, indices }],
    { get: createR2Get(r2), put: createR2Put(r2) },
    Date.now()
  );
  logInfo('cost indices published to R2', { systems, ...result });
  // The merge is idempotent, so a failed system is fixed by the next run; fail it so the log shows.
  if (result.failed > 0)
    throw new Error(`cost indices: ${result.failed} failed: ${result.firstError}`);
}
