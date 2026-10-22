/**
 * What the net worth chart reads (issue #2935): the stored snapshots, which
 * Characters hold every permission a snapshot needs, and each Character's
 * journal-backed daily wallet balance (the ISK backfill).
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useCharacterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { ESI_REGISTRY } from '@/esi/registry';
import { dailyWalletFromJournal } from '@/engine/netWorth/series';
import type { NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import { loadWalletJournal } from '@/features/character/wallet';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { REQUIRED_SCOPES } from './recordSnapshots';

const NO_IDS: ReadonlySet<number> = new Set();
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
  const coveredIds = useCharacterIdsWithScopes(REQUIRED_SCOPES, ids);
  const walletIds = useCharacterIdsWithScopes([WALLET_SCOPE], ids);

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

  const covered = coveredIds ?? NO_IDS;

  // The journal is read only for Characters that granted the wallet scope, so a
  // missing permission never provokes a live 403 and its app-wide re-auth banner.
  const walletIdsKey = [...(walletIds ?? [])].join(',');
  const [walletDaily, setWalletDaily] = useState<ReadonlyMap<number, Map<string, number>>>(
    new Map()
  );
  useEffect(() => {
    let cancelled = false;
    if (walletIdsKey === '') {
      void Promise.resolve().then(() => {
        if (!cancelled) setWalletDaily(new Map());
      });
      return () => {
        cancelled = true;
      };
    }
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
    ready: rows !== undefined && coveredIds !== undefined && walletIds !== undefined,
  };
}

const NO_MISSING: readonly string[] = [];

/**
 * The names of the `characters` net worth leaves out for want of a
 * snapshot permission (`covered` in `useNetWorthData`), for the page's
 * Character picker (`missingNames`). Empty until the permissions are read.
 *
 * The permission read covers every Character, not just `characters`: a
 * `useLiveQuery` keyed on the ids would hand back the previous ids' result for
 * a render after they change, and the picker would flash everyone as missing.
 */
export function useNetWorthMissingNames(
  characters: readonly { characterId: number; name: string }[]
): readonly string[] {
  const coveredIds = useCharacterIdsWithScopes(REQUIRED_SCOPES);
  return useMemo(() => {
    if (!coveredIds) return NO_MISSING;
    const missing = characters.filter((c) => !coveredIds.has(c.characterId)).map((c) => c.name);
    return missing.length === 0 ? NO_MISSING : missing;
  }, [characters, coveredIds]);
}
