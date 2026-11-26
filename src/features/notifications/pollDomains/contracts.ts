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

const isContractEntrySnapshot = shapeGuard<ContractEntrySnapshot>({
  contractId: is.number,
  status: is.oneOf(CONTRACT_STATUSES),
  issuerId: is.number,
  acceptorId: is.number,
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
    if (result.cached.truncated) return null;
    const thresholds = await currentThresholds(characterId);
    const dueLeadMs = thresholds.courierDeliveryDueLeadHours * HOUR_MS;
    const expiringLeadMs = thresholds.contractExpiringLeadHours * HOUR_MS;
    return result.cached.data.map((contract) =>
      toContractEntrySnapshot(contract, characterId, dueLeadMs, expiringLeadMs)
    );
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
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
