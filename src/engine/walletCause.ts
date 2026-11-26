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
  return { fires: kept, revisions: [...totals.values()] };
}
