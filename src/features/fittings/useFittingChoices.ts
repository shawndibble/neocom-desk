/**
 * Every Fitting the active Character can pick for a side question — the
 * Applied DPS overlay, a Projected-effects source: their saved ones (Dexie)
 * and their In-game ones (ESI, once granted), as one list with a way to turn
 * a pick into a domain `Fitting`.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { useInGameFittings } from './useLibraryFittings';

export interface FittingChoice {
  /** A saved Fitting's record id, or `game-<fitting_id>` for an In-game one. */
  id: string;
  name: string;
}

export interface FittingChoices {
  saved: FittingChoice[];
  inGame: FittingChoice[];
  /** Saved first, then In-game. */
  all: FittingChoice[];
  /** False until the saved list and, when granted, the In-game list have loaded. */
  ready: boolean;
  /** The picked Fitting, or null when it is gone or won't decode. */
  resolve: (id: string) => Promise<{ name: string; fitting: Fitting } | null>;
}

const inGameId = (fittingId: number) => `game-${fittingId}`;
const byName = (a: FittingChoice, b: FittingChoice) => a.name.localeCompare(b.name);

export function useFittingChoices(characterId: number | null): FittingChoices {
  const records = useLiveQuery(
    () =>
      characterId === null
        ? Promise.resolve([] as FittingRecord[])
        : db.fittings.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  const { granted, result, error } = useInGameFittings(characterId);
  const inGameFittings = result?.data;

  const saved = useMemo(
    () => (records ?? []).map((r): FittingChoice => ({ id: r.id, name: r.name })).sort(byName),
    [records]
  );
  const inGame = useMemo(
    () =>
      (inGameFittings ?? [])
        .map((f): FittingChoice => ({ id: inGameId(f.fitting_id), name: f.name }))
        .sort(byName),
    [inGameFittings]
  );
  const all = useMemo(() => [...saved, ...inGame], [saved, inGame]);

  // Read through a ref so `resolve` keeps one identity: callers key effects on
  // it, and a list refresh must not redraw a pick that didn't change.
  const latest = useRef({ records, inGameFittings });
  useEffect(() => {
    latest.current = { records, inGameFittings };
  });
  const resolve = useCallback(async (id: string) => {
    const { records, inGameFittings } = latest.current;
    const game = inGameFittings?.find((f) => inGameId(f.fitting_id) === id);
    if (game) return { name: game.name, fitting: esiFittingToFitting(game).fitting };
    const record = records?.find((r) => r.id === id);
    if (!record) return null;
    const decoded = await decodeFittingShare(record.code);
    if (!decoded.ok) return null;
    return { name: record.name, fitting: shareToFitting(decoded.value, record.name) };
  }, []);

  const inGameSettled = granted === false || result !== null || error;
  return { saved, inGame, all, ready: records !== undefined && inGameSettled, resolve };
}
