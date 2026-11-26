import { useCallback, useEffect, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import {
  readSrpSettings,
  reclaimSrp,
  saveSrpSettings,
  turnOffSrp,
  turnOnSrp,
  verifySrpOfficer,
} from '../srpClient';
import { recordSrpProbe } from './srpNavProbe';
import type { SrpOfficerVerdict, SrpSettings, SrpSettingsPatch } from '../srpTypes';

export type SrpSettingsState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'failed'; message: string }
  | { status: 'not-director'; verdict: SrpOfficerVerdict }
  | { status: 'never-on'; verdict: SrpOfficerVerdict }
  | { status: 'ready'; verdict: SrpOfficerVerdict; settings: SrpSettings };

export interface SrpSettingsData {
  state: SrpSettingsState;
  characterId: number | null;
  corporationId: number | null;
  reload: () => void;
  turnOn: () => Promise<void>;
  save: (patch: SrpSettingsPatch, enabled: boolean | null) => Promise<void>;
  reclaim: () => Promise<void>;
}

const DENIED = /permission-denied|unauthenticated|failed-precondition/;

export function useSrpSettings(): SrpSettingsData {
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const key =
    characterId === null || corporationId === null ? null : `${characterId}:${corporationId}`;
  const [loaded, setLoaded] = useState<{ key: string; state: SrpSettingsState } | null>(null);
  const state: SrpSettingsState =
    loaded !== null && loaded.key === key ? loaded.state : { status: 'loading' };
  const setState = useCallback(
    (next: SrpSettingsState) => key !== null && setLoaded({ key, state: next }),
    [key]
  );
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (characterId === null || corporationId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const verdict = await verifySrpOfficer(characterId, corporationId);
        if (cancelled) return;
        if (!verdict.isDirector) {
          setState({ status: 'not-director', verdict });
          return;
        }
        const settings =
          verdict.settingsExist === false
            ? null
            : await readSrpSettings(characterId, corporationId).catch((error) => {
                if (/permission-denied/.test((error as { code?: string }).code ?? '')) return null;
                throw error;
              });
        if (cancelled) return;
        recordSrpProbe(characterId, corporationId, settings?.enabled === true);
        setState(
          settings ? { status: 'ready', verdict, settings } : { status: 'never-on', verdict }
        );
      } catch (error) {
        if (cancelled) return;
        const code = (error as { code?: string }).code ?? '';
        setState(
          DENIED.test(code)
            ? { status: 'denied' }
            : { status: 'failed', message: error instanceof Error ? error.message : String(error) }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt, setState]);

  const turnOn = useCallback(async () => {
    if (characterId === null || corporationId === null) return;
    await turnOnSrp(characterId, corporationId);
    recordSrpProbe(characterId, corporationId, true);
    reload();
  }, [characterId, corporationId, reload]);

  const save = useCallback(
    async (patch: SrpSettingsPatch, enabled: boolean | null) => {
      if (characterId === null || corporationId === null) return;
      try {
        if (Object.keys(patch).length > 0) await saveSrpSettings(characterId, corporationId, patch);
        if (enabled === true) {
          await turnOnSrp(characterId, corporationId);
          recordSrpProbe(characterId, corporationId, true);
        }
        if (enabled === false) {
          await turnOffSrp(characterId, corporationId);
          recordSrpProbe(characterId, corporationId, false);
        }
      } finally {
        reload();
      }
    },
    [characterId, corporationId, reload]
  );

  const reclaim = useCallback(async () => {
    if (characterId === null || corporationId === null) return;
    await reclaimSrp(characterId, corporationId);
    reload();
  }, [characterId, corporationId, reload]);

  return { state, characterId, corporationId, reload, turnOn, save, reclaim };
}
