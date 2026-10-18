/**
 * Which contract event explains a wallet journal line, and how to fold the
 * line into that event's alert instead of raising a second one.
 *
 * A contract finishing moves ISK, so a Character with both
 * `contractCompleted` and `walletBalanceChanged` on would hear about one
 * thing twice. ESI names the cause on the journal line itself
 * (`context_id_type: 'contract_id'`, `context_id`, and a `contract_*`
 * `ref_type`), which is what links the two.
 *
 * The journal is cached for an hour and the contract list for five minutes,
 * so the line usually lands long after the contract alert. `absorbWalletFires`
 * therefore does two things: a contract fire in the same poll takes the amount
 * into its own copy, and a line whose contract alert fired in an earlier poll
 * comes back as a `revision` for the caller to write onto that alert's feed
 * row. Either way the wallet fire itself is dropped.
 *
 * Only the contract events the Character actually has switched on absorb
 * anything (`isEnabled`): a line whose cause would not be heard about stays a
 * wallet alert. Pure — the caller decides what "enabled" means per channel.
 */
import type { ContractNotificationFire, WalletNotificationFire } from './notificationDiffs';
import type { OccurrenceFire } from './occurrenceKey';

export type ContractCauseEventId = 'contractAccepted' | 'contractCompleted' | 'contractFailed';

export interface WalletLineRef {
  refType?: string;
  contextId?: number;
  contextIdType?: string;
}

export interface ContractCause {
  contractId: number;
  eventId: ContractCauseEventId;
}

/**
 * `ref_type` -> the transition that moves the ISK. Deliberately short: ESI
 * says a line's context varies by `ref_type`, so only the types whose
 * transition is certain are listed. A type absent here (the issuer's escrow
 * when a courier is created, every refund and reversal) stays a wallet alert
 * rather than risk filing ISK under the wrong contract event.
 *
 * `contractFailed` fires only for status `failed` (a courier past its
 * deadline); cancelled, expired and deleted contracts are silent, which is why
 * the refund types are not claimed — nothing would speak for them.
 */
const EVENT_BY_REF_TYPE: Readonly<Record<string, ContractCauseEventId>> = {
  contract_price: 'contractCompleted',
  contract_price_payment_corp: 'contractCompleted',
  contract_reward: 'contractCompleted',
  contract_auction_sold: 'contractCompleted',
  contract_collateral_refund: 'contractCompleted',
  contract_brokers_fee: 'contractCompleted',
  contract_brokers_fee_corp: 'contractCompleted',
  contract_sales_tax: 'contractCompleted',
  contract_deposit_sales_tax: 'contractCompleted',
  contract_collateral: 'contractAccepted',
  contract_collateral_payout: 'contractFailed',
};

export function contractCauseOf(line: WalletLineRef): ContractCause | null {
  if (line.refType === undefined || line.contextId === undefined) return null;
  if (line.contextIdType !== 'contract_id') return null;
  const eventId = EVENT_BY_REF_TYPE[line.refType];
  return eventId === undefined ? null : { contractId: line.contextId, eventId };
}

/** A wallet amount to write onto a contract alert that already fired. */
export interface WalletRevision {
  characterId: number;
  contractId: number;
  eventId: ContractCauseEventId;
  amountIsk: number;
}

export interface WalletAbsorption<TFire extends OccurrenceFire> {
  fires: TFire[];
  revisions: WalletRevision[];
}

function key(characterId: number, contractId: number, eventId: ContractCauseEventId): string {
  return `${characterId}:${eventId}:${contractId}`;
}

function isContractCauseFire(
  fire: OccurrenceFire
): fire is ContractNotificationFire & { eventId: ContractCauseEventId } {
  return (
    fire.eventId === 'contractAccepted' ||
    fire.eventId === 'contractCompleted' ||
    fire.eventId === 'contractFailed'
  );
}

/**
 * `isEnabled` says whether the Character hears about a contract event on the
 * channel being built, and gates the same-poll fold. `alertExists` is the proof
 * a cross-poll absorption needs: the contract alert's feed row is there to
 * revise. Without one of the two, the wallet fire stays — a line is only ever
 * dropped when something actually carries it.
 */
export function absorbWalletFires<TFire extends OccurrenceFire>(
  fires: readonly TFire[],
  isEnabled: (eventId: ContractCauseEventId) => boolean,
  alertExists: (cause: {
    characterId: number;
    contractId: number;
    eventId: ContractCauseEventId;
  }) => boolean
): WalletAbsorption<TFire> {
  const samePoll = new Set<string>();
  for (const fire of fires) {
    if (isContractCauseFire(fire) && isEnabled(fire.eventId)) {
      samePoll.add(key(fire.characterId, fire.contractId, fire.eventId));
    }
  }
  // Which absorbed lines belong to which contract alert, with their ISK summed.
  const totals = new Map<string, WalletRevision>();
  const absorbed = new Set<TFire>();
  for (const fire of fires) {
    if (fire.eventId !== 'walletBalanceChanged') continue;
    const wallet = fire as WalletNotificationFire;
    const cause = contractCauseOf(wallet);
    if (cause === null) continue;
    const carried =
      samePoll.has(key(wallet.characterId, cause.contractId, cause.eventId)) ||
      alertExists({ characterId: wallet.characterId, ...cause });
    if (!carried) continue;
    absorbed.add(fire);
    const k = key(wallet.characterId, cause.contractId, cause.eventId);
    const total = totals.get(k) ?? {
      characterId: wallet.characterId,
      contractId: cause.contractId,
      eventId: cause.eventId,
      amountIsk: 0,
    };
    total.amountIsk += wallet.amount ?? 0;
    totals.set(k, total);
  }

  const kept: TFire[] = [];
  for (const fire of fires) {
    if (absorbed.has(fire)) continue;
    if (isContractCauseFire(fire)) {
      const k = key(fire.characterId, fire.contractId, fire.eventId);
      const total = totals.get(k);
      if (total !== undefined) {
        totals.delete(k);
        kept.push({ ...fire, walletChangeIsk: total.amountIsk });
        continue;
      }
    }
    kept.push(fire);
  }
  // Whatever no same-poll contract fire took is for an alert raised earlier.
  return { fires: kept, revisions: [...totals.values()] };
}
