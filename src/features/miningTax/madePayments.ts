import type { Contract, WalletJournalEntry } from '@/esi/endpoints';
import type { EsiEndpointId } from '@/esi/registry';
import { loadWalletJournalHistory } from '@/features/character/wallet';
import { loadContracts } from '@/features/character/contracts';
import { humanizeRefType } from '@/features/character/format';
import { resolveNames } from '@/features/character/names';
import { formatLocalDate } from '@/lib/localDate';
import type { MadePayment } from './paymentLinks';
import { PAYMENT_REF_TYPES } from './paymentMatches';

const COMPLETED_CONTRACT_STATUSES = new Set<Contract['status']>([
  'finished',
  'finished_issuer',
  'finished_contractor',
]);

export function fromJournal(
  entries: readonly WalletJournalEntry[],
  characterId: number
): MadePayment[] {
  return entries
    .filter(
      (entry) =>
        PAYMENT_REF_TYPES.has(entry.ref_type) && entry.amount !== undefined && entry.amount < 0
    )
    .map((entry) => ({
      key: `journal:${entry.id}`,
      kind: 'journal' as const,
      refId: entry.id,
      characterId,
      date: entry.date,
      amount: Math.abs(entry.amount ?? 0),
      method: entry.ref_type.startsWith('contract_') ? 'contract' : 'donation',
      ...(entry.second_party_id !== undefined ? { counterpartyId: entry.second_party_id } : {}),
      label: humanizeRefType(entry.ref_type),
    }));
}

function fromContracts(contracts: readonly Contract[], characterId: number): MadePayment[] {
  return contracts
    .filter(
      (contract) =>
        contract.issuer_id === characterId &&
        contract.type === 'item_exchange' &&
        COMPLETED_CONTRACT_STATUSES.has(contract.status) &&
        (contract.price ?? 0) === 0 &&
        contract.assignee_id !== 0
    )
    .map((contract) => ({
      key: `contract:${contract.contract_id}`,
      kind: 'contract' as const,
      refId: contract.contract_id,
      characterId,
      date: contract.date_completed ?? contract.date_issued,
      amount: null,
      method: 'contract' as const,
      counterpartyId: contract.assignee_id,
      label: contract.title?.trim() ?? '',
    }));
}

export type MadePaymentSourceStatus = 'ok' | 'skipped-no-permission' | 'failed';

export interface MadePaymentSources {
  characterId: number;
  journal: MadePaymentSourceStatus;
  contracts: MadePaymentSourceStatus;
}

export interface MadePaymentsResult {
  payments: MadePayment[];
  sources: MadePaymentSources[];
}

export function missingPaymentEndpoints(sources: MadePaymentSources): EsiEndpointId[] {
  return [
    ...(sources.journal === 'skipped-no-permission' ? ['getCharacterWalletJournal' as const] : []),
    ...(sources.contracts === 'skipped-no-permission' ? ['getCharacterContracts' as const] : []),
  ];
}

export async function loadMadePaymentsWithStatus(
  characterIds: readonly number[]
): Promise<MadePaymentsResult> {
  const perCharacter = await Promise.all(
    characterIds.map(async (characterId) => {
      const [journal, contracts] = await Promise.all([
        loadWalletJournalHistory(characterId).catch(() => null),
        loadContracts(characterId).catch(() => null),
      ]);
      const status = (read: { needsReauth: boolean } | null): MadePaymentSourceStatus =>
        read === null ? 'failed' : read.needsReauth ? 'skipped-no-permission' : 'ok';
      return {
        payments: [
          ...fromJournal(journal?.cached?.data ?? [], characterId),
          ...fromContracts(contracts?.cached?.data ?? [], characterId),
        ],
        sources: { characterId, journal: status(journal), contracts: status(contracts) },
      };
    })
  );

  const payments = perCharacter
    .flatMap((c) => c.payments)
    .sort((a, b) => b.date.localeCompare(a.date));
  const names = await resolveNames(
    payments.map((p) => p.counterpartyId).filter((id): id is number => id !== undefined)
  );
  return {
    payments: payments.map((payment) => {
      const name = payment.counterpartyId ? names.get(payment.counterpartyId) : undefined;
      return name === undefined ? payment : { ...payment, counterpartyName: name };
    }),
    sources: perCharacter.map((c) => c.sources),
  };
}

export async function loadMadePayments(characterIds: readonly number[]): Promise<MadePayment[]> {
  return (await loadMadePaymentsWithStatus(characterIds)).payments;
}

export function paidOnFromIso(isoDate: string): string {
  const parsed = new Date(isoDate);
  return formatLocalDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
}
