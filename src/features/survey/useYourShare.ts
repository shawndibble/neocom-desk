/**
 * Loads what "Your share" needs for the active Character: the system to read
 * (the pilot's choice, else where they are now), their cached mining ledger
 * and the SDE's ore names and unit volumes, then runs the engine over them.
 * Re-reads when a newer scan arrives, since the ledger moves as they mine.
 */
import { useEffect, useState } from 'react';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadSystemName } from '@/features/character/systemSecurity';
import { loadMiningLedger } from '@/features/miningTax/ledger';
import { utcDate, yourShare, type OreType, type YourShare } from '@/engine/survey/yourShare';
import type { SurveySummary } from '@/engine/survey/series';
import { loadTypes } from '@/sde/loadSde';
import { useSurveySystem, type SurveySystem } from './surveySystemPref';

export type YourShareState =
  | { status: 'loading' }
  /** No chosen system and the current one is unknown (no location grant). */
  | { status: 'needSystem' }
  /** No ledger to read: the mining grant is missing or ESI did not answer. */
  | { status: 'unavailable' }
  | { status: 'ready'; system: SurveySystem; share: YourShare };

type Loaded = { key: string; state: YourShareState } | null;

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

  const [loaded, setLoaded] = useState<Loaded>(null);
  const [here, setHere] = useState<SurveySystem | null | undefined>(undefined);

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
  const surveyMined = summary === null ? 0 : summary.startVolume - summary.leftVolume;
  const key = [characterId, system?.id, summary?.firstAt, summary?.lastAt, surveyMined].join(':');

  useEffect(() => {
    if (characterId === null || summary === null || system === null) return;
    let cancelled = false;
    void (async () => {
      const [ledger, sdeTypes] = await Promise.all([
        loadMiningLedger(characterId).catch(() => null),
        loadTypes(),
      ]);
      if (cancelled) return;
      const rows = ledger?.cached?.data;
      if (rows === undefined) {
        setLoaded({ key, state: { status: 'unavailable' } });
        return;
      }
      const types = new Map<number, OreType>();
      for (const row of rows) {
        const type = sdeTypes[String(row.type_id)];
        if (type !== undefined && typeof type.volume === 'number') {
          types.set(row.type_id, { name: type.name, volume: type.volume });
        }
      }
      const share = yourShare({
        rows,
        systemId: system.id,
        fromDate: utcDate(summary.firstAt),
        toDate: utcDate(summary.lastAt),
        types,
        oreNames: new Set(summary.oreNames),
        surveyMined,
      });
      setLoaded({ key, state: { status: 'ready', system, share } });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, characterId, summary, system, surveyMined]);

  if (characterId === null || summary === null) return { status: 'unavailable' };
  if (!hydrated || (chosen === null && here === undefined)) return { status: 'loading' };
  if (system === null) return { status: 'needSystem' };
  // A result for another system or scan is stale; show nothing rather than the wrong figure.
  return loaded?.key === key ? loaded.state : { status: 'loading' };
}
