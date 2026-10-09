/**
 * Loads what "Your share" needs for the active Character, then runs the
 * engine over it: the cached mining ledger and the SDE's ore names and unit
 * volumes (read once per Character, and again when a newer scan arrives, since
 * the ledger moves as they mine), and the system to read (the pilot's choice,
 * else where they are now).
 *
 * The ledger is read before anything about the system is asked, so a pilot
 * with no mining grant never sees a prompt to name a system. Changing the
 * system recomputes from the ledger already held, with no flicker.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadSystemName } from '@/features/character/systemSecurity';
import { loadMiningLedger } from '@/features/miningTax/ledger';
import {
  utcDate,
  yourShare,
  type LedgerLine,
  type OreType,
  type YourShare,
} from '@/engine/survey/yourShare';
import type { SurveySummary } from '@/engine/survey/series';
import { loadTypes } from '@/sde/loadSde';
import { useSurveySystem, type SurveySystem } from './surveySystemPref';

export type YourShareState =
  | { status: 'loading' }
  /** No mining ledger to read: the grant is missing, ESI did not answer, or there is no Survey yet. */
  | { status: 'unavailable' }
  /** A ledger, but no chosen system and the current one is unknown (no location grant). */
  | { status: 'needSystem' }
  | { status: 'ready'; system: SurveySystem; share: YourShare };

interface LedgerData {
  rows: readonly LedgerLine[];
  types: ReadonlyMap<number, OreType>;
}

type LoadedLedger = { characterId: number; data: LedgerData | null } | null;

async function readLedger(characterId: number): Promise<LedgerData | null> {
  try {
    const [ledger, sdeTypes] = await Promise.all([loadMiningLedger(characterId), loadTypes()]);
    const rows = ledger.cached?.data;
    if (rows === undefined) return null;
    const types = new Map<number, OreType>();
    for (const row of rows) {
      const type = sdeTypes[String(row.type_id)];
      if (type !== undefined && typeof type.volume === 'number') {
        types.set(row.type_id, { name: type.name, volume: type.volume });
      }
    }
    return { rows, types };
  } catch {
    return null;
  }
}

export function useYourShare(
  characterId: number | null,
  summary: SurveySummary | null
): YourShareState {
  const chosen = useSurveySystem((s) => s.value);
  const hydrated = useSurveySystem((s) => s.hydrated);
  const hydrate = useSurveySystem((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const [ledger, setLedger] = useState<LoadedLedger>(null);
  const [here, setHere] = useState<SurveySystem | null | undefined>(undefined);
  const lastAt = summary?.lastAt;

  useEffect(() => {
    if (characterId === null || lastAt === undefined) return;
    let cancelled = false;
    void readLedger(characterId).then((data) => {
      if (!cancelled) setLedger({ characterId, data });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, lastAt]);

  // Where the pilot is now, asked once per Character.
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void (async () => {
      const id = await loadCharacterSolarSystemId(characterId).catch(() => null);
      const name = id === null ? null : await loadSystemName(id).catch(() => null);
      if (!cancelled) setHere(id !== null && name !== null ? { id, name } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const system = chosen ?? here ?? null;
  const data = ledger?.characterId === characterId ? ledger.data : null;
  const surveyMined = summary === null ? 0 : summary.startVolume - summary.leftVolume;

  const share = useMemo(
    () =>
      data === null || summary === null || system === null
        ? null
        : yourShare({
            rows: data.rows,
            systemId: system.id,
            fromDate: utcDate(summary.firstAt),
            toDate: utcDate(summary.lastAt),
            types: data.types,
            oreNames: new Set(summary.oreNames),
            surveyMined,
          }),
    [data, summary, system, surveyMined]
  );

  if (characterId === null || summary === null) return { status: 'unavailable' };
  if (!hydrated || ledger?.characterId !== characterId) return { status: 'loading' };
  if (data === null) return { status: 'unavailable' };
  if (system === null) return here === undefined ? { status: 'loading' } : { status: 'needSystem' };
  return share === null ? { status: 'loading' } : { status: 'ready', system, share };
}
