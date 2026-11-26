import { useCallback, useEffect, useMemo, useRef } from 'react';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { useInGameFittings } from './useLibraryFittings';
import { useSavedFittingRecords } from './useSavedFittingRecords';

export interface FittingChoice {
  id: string;
  name: string;
}

export interface FittingChoices {
  saved: FittingChoice[];
  inGame: FittingChoice[];
  all: FittingChoice[];
  ready: boolean;
  resolve: (id: string) => Promise<{ name: string; fitting: Fitting; code?: string } | null>;
}

const inGameId = (fittingId: number) => `game-${fittingId}`;
const byName = (a: FittingChoice, b: FittingChoice) => a.name.localeCompare(b.name);

export function useFittingChoices(characterId: number | null): FittingChoices {
  const records = useSavedFittingRecords(characterId);
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
    return {
      name: record.name,
      fitting: shareToFitting(decoded.value, record.name),
      code: record.code,
    };
  }, []);

  const inGameSettled = granted === false || result !== null || error;
  return { saved, inGame, all, ready: records !== undefined && inGameSettled, resolve };
}
