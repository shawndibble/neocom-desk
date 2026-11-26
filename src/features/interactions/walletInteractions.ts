import { formatNumber } from '@/lib/numberLocale';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import type { Interaction } from '@/engine/interactions/interactions';
import { highlightHref } from '@/lib/highlightParam';
import type { Translate } from '@/lib/translate';

const TYPE_BY_REF: Record<string, string> = {
  player_donation: 'donation',
  player_trading: 'trade',
  market_transaction: 'market',
  market_escrow: 'market',
  bounty_prize: 'bounty',
  bounty_prizes: 'bounty',
  corporation_payment: 'payment',
  corporation_account_withdrawal: 'payment',
};

function carriesContract(entry: WalletJournalEntry): boolean {
  return entry.ref_type.startsWith('contract_') || entry.context_id_type === 'contract_id';
}

export interface WalletInteractionsInput {
  characterId: number;
  otherId: number;
  journal: readonly WalletJournalEntry[];
  transactions: readonly WalletTransaction[];
  typeNames: ReadonlyMap<number, string>;
  t: Translate;
}

export function walletInteractions(input: WalletInteractionsInput): Interaction[] {
  const { characterId, otherId, journal, transactions, typeNames, t } = input;
  const fills = new Map(transactions.map((tx) => [tx.journal_ref_id, tx]));
  const out: Interaction[] = [];
  for (const entry of journal) {
    if (entry.first_party_id !== otherId && entry.second_party_id !== otherId) continue;
    if (entry.amount === undefined || carriesContract(entry)) continue;
    const at = Date.parse(entry.date);
    if (!Number.isFinite(at)) continue;
    const kind = TYPE_BY_REF[entry.ref_type] ?? 'other';
    const fill = kind === 'market' ? fills.get(entry.id) : undefined;
    let title = t(entry.amount >= 0 ? 'interactions.wallet.received' : 'interactions.wallet.sent');
    if (fill) {
      title = t(
        fill.is_buy ? 'interactions.wallet.marketBought' : 'interactions.wallet.marketSold',
        {
          quantity: formatNumber(fill.quantity),
          item: typeNames.get(fill.type_id) ?? `#${fill.type_id}`,
        }
      );
    }
    out.push({
      id: `wallet-${characterId}-${entry.id}`,
      kind: 'wallet',
      at,
      type: `interactions.type.${kind}`,
      tone: kind === 'bounty' ? 'accent' : 'neutral',
      title,
      ...(entry.reason ? { detail: entry.reason } : {}),
      isk: entry.amount,
      characterId,
      to: highlightHref('/wallet/journal', entry.id),
    });
  }
  return out;
}
