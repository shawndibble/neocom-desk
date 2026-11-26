import { formatNumber } from '@/lib/numberLocale';
import type { Contract } from '@/esi/endpoints';
import type { Interaction, InteractionTone } from '@/engine/interactions/interactions';
import { isFinishedContractStatus } from '@/engine/contracts/contractStatus';
import { contractAmount } from '@/features/character/contractAmount';
import { highlightHref } from '@/lib/highlightParam';
import type { Translate } from '@/lib/translate';

const TYPE: Record<string, string> = {
  courier: 'courier',
  item_exchange: 'itemExchange',
  auction: 'auction',
};

type State = 'completed' | 'outstanding' | 'rejected' | 'failed' | 'expired';
const STATE_TONE: Record<State, InteractionTone> = {
  completed: 'success',
  outstanding: 'neutral',
  rejected: 'danger',
  failed: 'danger',
  expired: 'neutral',
};

function stateOf(contract: Contract, now: number): State | null {
  if (isFinishedContractStatus(contract.status)) return 'completed';
  switch (contract.status) {
    case 'rejected':
      return 'rejected';
    case 'failed':
    case 'reversed':
      return 'failed';
    case 'outstanding':
    case 'in_progress':
      return Date.parse(contract.date_expired) < now && !contract.acceptor_id
        ? 'expired'
        : 'outstanding';
    default:
      return null;
  }
}

export function courierLocationIds(contracts: readonly Contract[]): number[] {
  const ids = new Set<number>();
  for (const c of contracts) {
    if (c.type !== 'courier') continue;
    if (c.start_location_id) ids.add(c.start_location_id);
    if (c.end_location_id) ids.add(c.end_location_id);
  }
  return [...ids];
}

export interface ContractInteractionsInput {
  characterId: number;
  otherId: number;
  contracts: readonly Contract[];
  locationNames: ReadonlyMap<number, string>;
  now: number;
  t: Translate;
}

export function contractInteractions(input: ContractInteractionsInput): Interaction[] {
  const { characterId, otherId, contracts, locationNames, now, t } = input;
  const out: Interaction[] = [];
  for (const c of contracts) {
    const kind = TYPE[c.type];
    if (!kind || c.for_corporation) continue;
    const viewerIssued = c.issuer_id === characterId;
    const otherIssued = c.issuer_id === otherId;
    const viewerOnOtherEnd = c.assignee_id === characterId || c.acceptor_id === characterId;
    const otherOnOtherEnd = c.assignee_id === otherId || c.acceptor_id === otherId;
    const between = (viewerIssued && otherOnOtherEnd) || (otherIssued && viewerOnOtherEnd);
    if (!between) continue;
    const state = stateOf(c, now);
    if (!state) continue;
    const at = Date.parse(c.date_completed ?? c.date_accepted ?? c.date_issued);
    if (!Number.isFinite(at)) continue;

    let title: string;
    if (c.type === 'courier') {
      title = t('interactions.contract.courierTitle', {
        from: locationNames.get(c.start_location_id ?? 0) ?? '?',
        to: locationNames.get(c.end_location_id ?? 0) ?? '?',
        volume: formatNumber(Math.round(c.volume ?? 0)),
      });
    } else {
      title = c.title?.trim() || t('interactions.contract.itemExchangeTitle');
      if (c.type === 'auction' && !c.title?.trim()) title = t('interactions.contract.auctionTitle');
    }

    const amount = contractAmount(c) ?? 0;
    const issuerGets = c.type !== 'courier';
    const signed = (viewerIssued ? 1 : -1) * (issuerGets ? 1 : -1) * amount;
    out.push({
      id: `contract-${characterId}-${c.contract_id}`,
      kind: 'contract',
      at,
      type: `interactions.type.${kind}`,
      tone: 'neutral',
      title,
      detail: t(
        viewerIssued ? 'interactions.contract.issuedByYou' : 'interactions.contract.issuedByThem'
      ),
      ...(state === 'completed' && amount > 0 ? { isk: signed } : {}),
      state: `interactions.state.${state}`,
      stateTone: STATE_TONE[state],
      characterId,
      to: `${highlightHref('/contracts/history', c.contract_id)}&history.chars=all`,
    });
  }
  return out;
}
