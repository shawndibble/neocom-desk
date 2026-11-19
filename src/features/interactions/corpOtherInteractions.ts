/**
 * Show Info › Interactions, Corporation scope: the corp wallet, corp contracts and killmails with
 * the player. Pure mapping; `corpFacts.ts` does the loading.
 */
import type { Contract, WalletJournalEntry } from '@/esi/endpoints';
import type { Interaction } from '@/engine/interactions/interactions';
import { formatIskCompact } from '@/lib/isk';
import { openHref } from '@/lib/highlightParam';
import type { Translate } from '@/lib/translate';
import { killZkillUrl, type KillInvolvement } from '@/lib/zkillboard';

const WALLET_TYPE: Record<string, string> = {
  player_donation: 'donation',
  player_trading: 'trade',
  corporation_payment: 'payment',
  corporation_account_withdrawal: 'payment',
};

/** A corp journal row with the player, dated and signed from the corp's side. `division` is the wallet division. */
export interface CorpJournalRow {
  division: number;
  entry: WalletJournalEntry;
}

/**
 * Corp wallet rows with `otherId`. A row the corp book already lists as a tax payment
 * (`bookPaymentIds`) and a row that only carries a contract's price are left out.
 */
export function corpWalletInteractions(
  rows: readonly CorpJournalRow[],
  otherId: number,
  bookPaymentIds: ReadonlySet<string>,
  t: Translate
): Interaction[] {
  const out: Interaction[] = [];
  for (const { division, entry } of rows) {
    if (entry.first_party_id !== otherId && entry.second_party_id !== otherId) continue;
    if (entry.amount === undefined) continue;
    if (entry.ref_type.startsWith('contract_') || entry.context_id_type === 'contract_id') continue;
    const at = Date.parse(entry.date);
    if (!Number.isFinite(at)) continue;
    if (bookPaymentIds.has(`j${division}_${entry.id}`)) continue;
    const kind = WALLET_TYPE[entry.ref_type] ?? 'other';
    out.push({
      id: `corp-wallet-${division}-${entry.id}`,
      kind: 'wallet',
      at,
      type: `interactions.type.${kind}`,
      tone: 'neutral',
      title: t(
        entry.amount >= 0 ? 'interactions.corp.wallet.received' : 'interactions.corp.wallet.sent'
      ),
      detail: entry.reason?.trim() || undefined,
      isk: entry.amount,
      to: `/corp/wallet?division=${division}&highlight=${entry.id}`,
    });
  }
  return out;
}

const CONTRACT_TYPE: Record<Contract['type'], string> = {
  courier: 'courier',
  item_exchange: 'itemExchange',
  auction: 'auction',
  loan: 'other',
  unknown: 'other',
};

function contractState(c: Contract): { state: string; tone: Interaction['stateTone'] } {
  switch (c.status) {
    case 'finished':
    case 'finished_issuer':
    case 'finished_contractor':
      return { state: 'interactions.state.completed', tone: 'success' };
    case 'rejected':
      return { state: 'interactions.state.rejected', tone: 'danger' };
    case 'failed':
      return { state: 'interactions.state.failed', tone: 'danger' };
    case 'cancelled':
    case 'deleted':
    case 'reversed':
      return { state: 'interactions.state.expired', tone: 'neutral' };
    default:
      return { state: 'interactions.state.outstanding', tone: 'warning' };
  }
}

/** Corp contracts the player issued, was assigned or accepted. */
export function corpContractInteractions(
  contracts: readonly Contract[],
  otherId: number,
  t: Translate
): Interaction[] {
  const out: Interaction[] = [];
  for (const c of contracts) {
    const theyIssued = c.issuer_id === otherId;
    if (!theyIssued && c.assignee_id !== otherId && c.acceptor_id !== otherId) continue;
    const at = Date.parse(c.date_issued);
    if (!Number.isFinite(at)) continue;
    const { state, tone } = contractState(c);
    const amount = c.price ?? c.reward ?? c.collateral ?? 0;
    out.push({
      id: `corp-contract-${c.contract_id}`,
      kind: 'contract',
      at,
      type: `interactions.type.${CONTRACT_TYPE[c.type]}`,
      tone: 'neutral',
      title:
        c.title?.trim() ||
        t(
          theyIssued ? 'interactions.corp.contract.theyIssued' : 'interactions.corp.contract.toThem'
        ),
      detail: amount > 0 ? formatIskCompact(amount) : undefined,
      state,
      stateTone: tone,
      to: openHref('/contracts/history?scope=corp', c.contract_id),
    });
  }
  return out;
}

/** One killmail between the corp and the player. */
export interface CorpKill {
  killmailId: number;
  /** Epoch ms. */
  at: number;
  /** `weLost`: a corp pilot died with the player on it. `weKilled`: a corp pilot got the kill, the player died. */
  side: 'weLost' | 'weKilled';
  value: number | null;
  /** The corp's SRP paid this loss. */
  srpPaid: boolean;
}

/**
 * Which of the player's killmails involve a corp member: their kills with a member as the victim
 * are corp losses, their losses with a member among the attackers are corp kills.
 */
export function classifyCorpKills(
  lists: { kills: readonly KillInvolvement[]; losses: readonly KillInvolvement[] },
  isMember: (characterId: number) => boolean,
  srpPaidIds: ReadonlySet<number> = new Set()
): CorpKill[] {
  const out = new Map<number, CorpKill>();
  for (const k of lists.kills) {
    if (k.victimCharacterId === null || !isMember(k.victimCharacterId)) continue;
    out.set(k.killmailId, {
      killmailId: k.killmailId,
      at: k.timeMs,
      side: 'weLost',
      value: k.value,
      srpPaid: srpPaidIds.has(k.killmailId),
    });
  }
  for (const k of lists.losses) {
    if (out.has(k.killmailId) || !k.attackerCharacterIds.some(isMember)) continue;
    out.set(k.killmailId, {
      killmailId: k.killmailId,
      at: k.timeMs,
      side: 'weKilled',
      value: k.value,
      srpPaid: false,
    });
  }
  return [...out.values()];
}

export function corpKillInteractions(kills: readonly CorpKill[], t: Translate): Interaction[] {
  return kills.map((k) => ({
    id: `corp-kill-${k.killmailId}`,
    kind: 'kill',
    at: k.at,
    type: `interactions.type.${k.side}`,
    tone: k.side === 'weLost' ? 'danger' : 'success',
    title: t(`interactions.corp.kill.${k.side}`),
    detail:
      k.value === null
        ? undefined
        : t('interactions.kill.value', { value: formatIskCompact(k.value) }),
    ...(k.srpPaid ? { state: 'interactions.state.srpPaid', stateTone: 'success' as const } : {}),
    to: killZkillUrl(k.killmailId),
  }));
}
