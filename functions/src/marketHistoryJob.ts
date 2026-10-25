import { error as logError, info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import { ESI_USER_AGENT } from './esiNotifications.js';
import { firestore } from './firestore.js';
import {
  INSURGENCY_URL,
  LAWLESS_SYSTEMS_DOC,
  SYSTEM_CONDITIONS_COLLECTION,
  lawlessWriteNeeded,
  parseLawlessSystemIds,
} from './lawlessSystems.js';
import {
  MARKET_OPEN_PRICES_META_PATH,
  OpenPriceFold,
  SNAPSHOT_HUBS,
  StationPriceFold,
  findFinalSnapshot,
  groupByDocument,
  implausibleReason,
  mergeDays,
  previousUtcDate,
  regionCounts,
  shrunkRegion,
} from './marketOpenPrices.js';
import { fetchJson as fetchEverefJson, foldSnapshotUrl } from './marketOrdersArchive.js';
import { createR2Get, createR2Put } from './r2Publisher.js';
import { r2ConfigOrThrow } from './r2Publish.js';
import { writeOpenPricesToR2 } from './r2DailySnapshots.js';

// The public data hosts (EVE Ref, EVE Workbench, the LP and insurgency feeds)
// get the ESI User-Agent naming this app, never a personal contact.
export const PUBLIC_HOST_USER_AGENT = ESI_USER_AGENT;

/**
 * `systemConditions/lawless` as this warm instance last read or wrote it. This
 * job is its only writer, so after the first run an instance knows the doc
 * without paying a read every 15 minutes; a cold start reads it once.
 */
let lawlessSeen: Record<string, unknown> | undefined;

/** Body of syncLawlessSystems (see its doc in index.ts). */
export async function runSyncLawlessSystems(): Promise<void> {
  const response = await fetch(INSURGENCY_URL, {
    headers: {
      'User-Agent': PUBLIC_HOST_USER_AGENT,
      'X-User-Agent': PUBLIC_HOST_USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    logWarn('lawless systems fetch failed', { status: response.status });
    return;
  }
  const body: unknown = await response.json().catch(() => null);
  // A changed or broken body is not "nothing lawless": write nothing, let the doc age.
  if (!Array.isArray(body)) {
    logWarn('lawless systems body was not a list');
    return;
  }
  const systemIds = parseLawlessSystemIds(body);
  const ref = firestore().collection(SYSTEM_CONDITIONS_COLLECTION).doc(LAWLESS_SYSTEMS_DOC);
  const now = Date.now();
  const stored = lawlessSeen ?? (await ref.get()).data();
  const written = lawlessWriteNeeded(stored, systemIds, now);
  if (written) {
    const next = { systemIds, updatedAt: now };
    await ref.set(next);
    lawlessSeen = next;
  } else {
    lawlessSeen = stored;
  }
  logInfo('lawless systems sync', { count: systemIds.length, written });
}

/** Body of syncMarketOpenPrices (see its doc in index.ts). */
export async function runSyncMarketOpenPrices(): Promise<void> {
  const date = previousUtcDate(new Date());
  const found = await findFinalSnapshot(date, (url) =>
    fetchEverefJson(url, PUBLIC_HOST_USER_AGENT)
  );
  if (!found.final) {
    // Thrown, not returned, so the run fails and is retried.
    throw new Error(
      `Market open prices: no final snapshot listed for ${date} (last listed: ${found.snapshot?.fileTime ?? 'none'}); retried, and after the last retry the day has no point`
    );
  }
  const { url: snapshotUrl, fileTime } = found.snapshot;
  const fold = new OpenPriceFold();
  // The hub-station Open Prices ride the same single pass; the region fold
  // only feeds the guards.
  const stations = new StationPriceFold(SNAPSHOT_HUBS);
  const rows = await foldSnapshotUrl(snapshotUrl, fold, PUBLIC_HOST_USER_AGENT, stations);
  logInfo('Market open prices fold', {
    date,
    fileTime,
    snapshotUrl,
    rows,
    pairs: fold.size,
    stationPairs: stations.size,
  });
  const reason = implausibleReason(fold);
  if (reason) {
    logError('Market open prices sync skipped publishing', { date, reason });
    return;
  }
  const db = firestore();
  const meta = db.doc(MARKET_OPEN_PRICES_META_PATH);
  const shrunk = shrunkRegion(fold, (await meta.get()).data()?.regions);
  if (shrunk) {
    logError('Market open prices sync skipped publishing: snapshot shrank', {
      date,
      reason: shrunk,
      hint: `if the drop is real, delete ${MARKET_OPEN_PRICES_META_PATH}`,
    });
    return;
  }
  const r2 = r2ConfigOrThrow();
  const get = createR2Get(r2);
  const put = createR2Put(r2);
  const { written, failed, firstError } = await writeOpenPricesToR2(
    groupByDocument(new Map([[date, stations]])),
    mergeDays,
    { get, put }
  );
  if (failed > 0) {
    // Thrown so the run is retried; meta is only recorded for a complete day.
    throw new Error(
      `Market open prices: ${failed} types failed to write to R2 (${written} written); first error: ${firstError}`
    );
  }
  await meta.set({ date, regions: regionCounts(fold) });
  logInfo('Market open prices sync', { date, written });
}
