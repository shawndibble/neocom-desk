import { captureException } from '@sentry/react';
import type { Interaction } from '@/engine/interactions/interactions';
import {
  hasWalletScope,
  loadWalletJournalHistory,
  loadWalletTransactionsHistory,
} from '@/features/character/wallet';
import { loadTypeNames } from '@/features/character/typeNames';
import { walletInteractions } from './walletInteractions';
import type { PersonalSource } from './sourceTypes';

export const walletSource: PersonalSource = async ({ otherId, characterIds, t }) => {
  const perCharacter = await Promise.all(
    characterIds.map(async (characterId): Promise<Interaction[]> => {
      try {
        if (!(await hasWalletScope(characterId))) return [];
        const { cached, needsReauth } = await loadWalletJournalHistory(characterId);
        if (!cached || needsReauth) return [];
        const rows = cached.data.filter(
          (e) => e.first_party_id === otherId || e.second_party_id === otherId
        );
        if (rows.length === 0) return [];
        const transactions = rows.some((e) => e.ref_type === 'market_transaction')
          ? ((await loadWalletTransactionsHistory(characterId).catch(() => null))?.data ?? [])
          : [];
        const refIds = new Set(rows.map((e) => e.id));
        const fills = transactions.filter((tx) => refIds.has(tx.journal_ref_id));
        const typeNames = await loadTypeNames([...new Set(fills.map((tx) => tx.type_id))]);
        return walletInteractions({
          characterId,
          otherId,
          journal: rows,
          transactions: fills,
          typeNames,
          t,
        });
      } catch (error) {
        captureException(error);
        return [];
      }
    })
  );
  return perCharacter.flat();
};
