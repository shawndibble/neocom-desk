/**
 * What the net worth chart reads (issue #2935): the stored snapshots, which
 * Characters hold every permission a snapshot needs, and each Character's
 * journal-backed daily wallet balance (the ISK backfill).
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { dailyWalletFromJournal } from '@/engine/netWorth/series';
import type { NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import { loadWalletJournal } from '@/features/character/wallet';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { REQUIRED_SCOPES } from './recordSnapshots';

const NO_ROWS: readonly NetWorthSnapshotRow[] = [];
const WALLET_SCOPE = ESI_REGISTRY.getCharacterWallet.scope;

export interface NetWorthData {
  snapshotsByCharacter: ReadonlyMap<number, NetWorthSnapshotRow[]>;
  /** Characters holding the wallet, assets and orders permissions. */
  covered: ReadonlySet<number>;
  walletDailyByCharacter: ReadonlyMap<number, Map<string, number>>;
  /** Snapshots and permissions have been read once. */
  ready: boolean;
}

export function useNetWorthData(characterIds: readonly number[]): NetWorthData {
  const idsKey = characterIds.join(',');
  const ids = useMemo(() => (idsKey === '' ? [] : idsKey.split(',').map(Number)), [idsKey]);

  const rows = useLiveQuery(
    () => db.netWorthSnapshots.where('characterId').anyOf(ids).toArray(),
    [idsKey]
  );
  const scopes = useLiveQuery(async () => {
    const tokens = await db.tokens.bulkGet(ids);
    return ids.map((id, i) => ({ id, scopes: tokens[i]?.scopes ?? [] }));
  }, [idsKey]);

  const snapshotsByCharacter = useMemo(() => {
    const byId = new Map<number, NetWorthSnapshotRow[]>();
    for (const row of rows ?? NO_ROWS) {
      const list = byId.get(row.characterId) ?? [];
      list.push(row);
      byId.set(row.characterId, list);
    }
    for (const list of byId.values()) list.sort((a, b) => a.day.localeCompare(b.day));
    return byId;
  }, [rows]);

  const covered = useMemo(
    () =>
      new Set(
        (scopes ?? [])
          .filter((entry) => REQUIRED_SCOPES.every((scope) => entry.scopes.includes(scope)))
          .map((entry) => entry.id)
      ),
    [scopes]
  );

  // The journal is read only for Characters that granted the wallet scope, so a
  // missing permission never provokes a live 403 and its app-wide re-auth banner.
  const walletIdsKey = (scopes ?? [])
    .filter((entry) => entry.scopes.includes(WALLET_SCOPE))
    .map((entry) => entry.id)
    .join(',');
  const [walletDaily, setWalletDaily] = useState<ReadonlyMap<number, Map<string, number>>>(
    new Map()
  );
  useEffect(() => {
    if (walletIdsKey === '') return;
    let cancelled = false;
    const walletIds = walletIdsKey.split(',').map(Number);
    const loaded = new Map<number, Map<string, number>>();
    void mapWithConcurrencyLimit(walletIds, ESI_FANOUT_CONCURRENCY, async (id) => {
      try {
        const result = await loadWalletJournal(id);
        loaded.set(id, dailyWalletFromJournal(result?.data ?? []));
      } catch {
        loaded.set(id, new Map());
      }
    }).then(() => {
      if (!cancelled) setWalletDaily(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [walletIdsKey]);

  return {
    snapshotsByCharacter,
    covered,
    walletDailyByCharacter: walletDaily,
    ready: rows !== undefined && scopes !== undefined,
  };
}
