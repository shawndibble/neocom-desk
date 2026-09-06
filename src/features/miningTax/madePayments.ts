/**
 * The payments a pilot has already made, gathered for the reverse settle-up
 * flow (issue #540) and normalized into one `MadePayment` shape so the matcher
 * and the dialog see a single kind of thing.
 *
 * Two sources, and only two:
 *
 * - **Wallet journal**, the primary one. `PAYMENT_REF_TYPES` already covers
 *   `contract_price` and friends, so *accepting the landlord's ISK contract*
 *   arrives here for free — no contract-specific handling needed for it.
 * - **Contracts**, purely for payment **in kind**: an `item_exchange` contract
 *   the pilot issued at no price, i.e. ore handed over instead of ISK. Its
 *   cargo is deliberately never priced (no `getCharacterContractItems` call) —
 *   the decision doc rules out a second valuation model beside the Jita
 *   snapshot Assignments already carry, so the amount is confirmed by the pilot.
 *
 * Both reads degrade quietly. Neither scope is in `ROUTE_REQUIREMENTS` for
 * `/moon-mining` (that table gates the whole page), so a pilot without them —
 * or offline — simply gets no suggestions rather than an error.
 */
import type { Contract, WalletJournalEntry } from '@/esi/endpoints';
import { loadWalletJournal } from '@/features/character/wallet';
import { loadContracts } from '@/features/character/contracts';
import { humanizeRefType } from '@/features/character/format';
import { resolveNames } from '@/features/character/names';
import type { MadePayment } from './paymentLinks';
import { PAYMENT_REF_TYPES } from './paymentMatches';

/** A contract that has actually gone through — a cancelled or expired one paid nothing. */
const COMPLETED_CONTRACT_STATUSES = new Set<Contract['status']>([
  'finished',
  'finished_issuer',
  'finished_contractor',
]);

/** Outgoing hand-made ISK movements: the journal half of "what have I paid?". */
function fromJournal(entries: readonly WalletJournalEntry[], characterId: number): MadePayment[] {
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
      // Read off the raw ref_type here, where it is still available, rather
      // than recovered downstream from the humanized label — that would make a
      // domain fact hostage to a wording change.
      method: entry.ref_type.startsWith('contract_') ? 'contract' : 'donation',
      ...(entry.second_party_id !== undefined ? { counterpartyId: entry.second_party_id } : {}),
      label: humanizeRefType(entry.ref_type),
    }));
}

/**
 * Payment in kind: an item-exchange contract this character issued to a named
 * assignee for no ISK. `price` is what the *acceptor* pays the issuer, so a
 * zero-price contract from us is us giving something away — the shape of
 * handing over ore as tax.
 */
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
      // Never priced from the cargo — see the module comment.
      amount: null,
      method: 'contract' as const,
      counterpartyId: contract.assignee_id,
      // The pilot's own contract title, or nothing — a translated fallback for
      // an untitled contract belongs in the view, not in this loader.
      label: contract.title?.trim() ?? '',
    }));
}

/**
 * Every payment the given characters have made recently, newest first, with
 * recipient names resolved so a suggestion can say who the ISK went to.
 *
 * Never rejects: a failed or unauthorized read for one character contributes
 * nothing and leaves the rest intact.
 */
export async function loadMadePayments(characterIds: readonly number[]): Promise<MadePayment[]> {
  const perCharacter = await Promise.all(
    characterIds.map(async (characterId) => {
      const [journal, contracts] = await Promise.all([
        loadWalletJournal(characterId).catch(() => null),
        loadContracts(characterId).catch(() => null),
      ]);
      return [
        ...fromJournal(journal?.data ?? [], characterId),
        ...fromContracts(contracts?.cached?.data ?? [], characterId),
      ];
    })
  );

  const payments = perCharacter.flat().sort((a, b) => b.date.localeCompare(a.date));
  const names = await resolveNames(
    payments.map((p) => p.counterpartyId).filter((id): id is number => id !== undefined)
  );
  return payments.map((payment) => {
    const name = payment.counterpartyId ? names.get(payment.counterpartyId) : undefined;
    return name === undefined ? payment : { ...payment, counterpartyName: name };
  });
}
