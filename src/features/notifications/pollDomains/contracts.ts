import { loadContracts as loadCharacterContracts } from '@/features/character/contracts';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { projectContracts } from '@/engine/projection';
import type { Contract } from '@/esi/endpoints';
import type {
  ContractEntrySnapshot,
  ContractNotificationFire,
  ContractSnapshot,
  ContractStatus,
} from '@/engine/notificationDiffs';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { HOUR_MS, currentThresholds, optionalDateMs } from './shared';

/* Contracts ------------------------------------------------------------------ */

const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'outstanding',
  'in_progress',
  'finished_issuer',
  'finished_contractor',
  'finished',
  'cancelled',
  'rejected',
  'failed',
  'deleted',
  'reversed',
];

/**
 * Strict about `issuerId`/`acceptorId` for the same reason the wallet guard
 * is strict about `dateMs` (issue #1091): a baseline written before these
 * fields existed fails validation, so `pollerState.ts` reads it as `null` and
 * the first poll after this change fires nothing rather than replaying every
 * contract's history against a baseline that never recorded who was party to it.
 *
 * The invalidation is store-wide, not per-character: `isSnapshotWith`'s
 * `entries.every(isEntry)` fails a whole character's snapshot on one bad
 * entry, and `isPollerState` requires every character in the stored blob to
 * pass — so one character still on a pre-#1091 baseline invalidates
 * `notifications.pollerState.contracts` for every character on the device,
 * not just that one. Still net-correct (no false completed/failed backfire
 * for anyone), just a wider one-time reset than "a baseline" implies.
 */
const isContractEntrySnapshot = shapeGuard<ContractEntrySnapshot>({
  contractId: is.number,
  status: is.oneOf(CONTRACT_STATUSES),
  issuerId: is.number,
  acceptorId: is.number,
  // Optional: a baseline written before `courierDeliveryDue` (issue #1713)
  // lacks both, and must stay readable rather than reset every character.
  deliveryDeadlineMs: is.optional(is.number),
  dueLeadMs: is.optional(is.number),
  expiresMs: is.optional(is.number),
  expiringLeadMs: is.optional(is.number),
  dateAcceptedMs: is.optional(is.number),
  dateCompletedMs: is.optional(is.number),
});

function toContractEntrySnapshot(
  contract: Contract,
  characterId: number,
  dueLeadMs: number,
  expiringLeadMs: number
): ContractEntrySnapshot {
  const deliveryDeadlineMs = courierDeliveryDeadlineMs(contract);
  // Only an unaccepted contract the Character issued can lapse on them
  // (`contractExpiring`, issue #3797).
  const expiresMs =
    contract.status === 'outstanding' && contract.issuer_id === characterId
      ? optionalDateMs(contract.date_expired)
      : undefined;
  const dateAcceptedMs = optionalDateMs(contract.date_accepted);
  const dateCompletedMs = optionalDateMs(contract.date_completed);
  return {
    contractId: contract.contract_id,
    status: contract.status,
    issuerId: contract.issuer_id,
    acceptorId: contract.acceptor_id,
    ...(deliveryDeadlineMs === null ? {} : { deliveryDeadlineMs, dueLeadMs }),
    ...(expiresMs === undefined ? {} : { expiresMs, expiringLeadMs }),
    ...(dateAcceptedMs === undefined ? {} : { dateAcceptedMs }),
    ...(dateCompletedMs === undefined ? {} : { dateCompletedMs }),
  };
}

export const contractDomain = defineDomain<
  ContractEntrySnapshot,
  ContractSnapshot,
  ContractNotificationFire
>({
  source: SNAPSHOT_SOURCES.contracts,
  stateKey: 'notifications.pollerState.contracts',
  entriesKey: 'entries',
  isEntry: isContractEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterContracts(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // A truncated page set would persist a short ContractSnapshot missing
    // contracts already in_progress; the next complete poll would then see
    // them as newly appearing and false-fire contractAccepted (issue #174
    // review) — skip this poll entirely rather than save a partial baseline.
    if (result.cached.truncated) return null;
    const thresholds = await currentThresholds(characterId);
    const dueLeadMs = thresholds.courierDeliveryDueLeadHours * HOUR_MS;
    const expiringLeadMs = thresholds.contractExpiringLeadHours * HOUR_MS;
    return result.cached.data.map((contract) =>
      toContractEntrySnapshot(contract, characterId, dueLeadMs, expiringLeadMs)
    );
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // Projects at the Character's *current* lead time, not the one baked into
  // the baseline, for `skillQueueDomain.projection`'s reason (issue #1248).
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const thresholds = await currentThresholds(characterId);
    const dueLeadMs = thresholds.courierDeliveryDueLeadHours * HOUR_MS;
    const expiringLeadMs = thresholds.contractExpiringLeadHours * HOUR_MS;
    const entries = snapshot.entries.map((entry) => ({
      ...entry,
      ...(entry.deliveryDeadlineMs === undefined ? {} : { dueLeadMs }),
      ...(entry.expiresMs === undefined ? {} : { expiringLeadMs }),
    }));
    return projectContracts(
      characterId,
      characterName,
      entries,
      (fire, character, names) =>
        NOTIFICATION_EVENT_ENTRIES.courierDeliveryDue.projection.push(fire, character, names),
      nowMs
    );
  },
});
