import { info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import { ESI_USER_AGENT } from './esiNotifications.js';
import { firestore } from './firestore.js';
import {
  INSURGENCY_URL,
  LAWLESS_SYSTEMS_DOC,
  SYSTEM_CONDITIONS_COLLECTION,
  lawlessWriteNeeded,
  parseLawlessSystemIds,
} from './lawlessSystems.js';
// The public data hosts (EVE Ref, EVE Workbench, the LP and insurgency feeds)
// get the ESI User-Agent naming this app, never a personal contact.
export const PUBLIC_HOST_USER_AGENT = ESI_USER_AGENT;

/**
 * `systemConditions/lawless` as this warm instance last read or wrote it. This
 * job is its only writer, so after the first run an instance knows the doc
 * without paying a read every 15 minutes; a cold start reads it once. Another
 * instance (or a hand edit) can change the doc behind this copy; the heartbeat
 * rewrite (`LAWLESS_HEARTBEAT_MS`) bounds how long that goes unnoticed.
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
