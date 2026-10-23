/**
 * `/corp/srp` Settings' data (issue #4851): verify the Character as an SRP officer first (it
 * records the 24-hour officer access the rules need), then read `corps/{id}/srp/settings`,
 * the same order the Corp Tax Book's `useCorpBook` uses. Firestore is the `lite` build with no
 * listeners, so every change reloads. Settings need a Director (the CEO counts as one), which
 * the verdict says; an Accountant gets `not-director`.
 */
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
import type { SrpOfficerVerdict, SrpSettings, SrpSettingsPatch } from '../srpTypes';

export type SrpSettingsState =
  | { status: 'loading' }
  /** The roles do not open SRP (or the Character is not in this corporation). */
  | { status: 'denied' }
  | { status: 'failed'; message: string }
  /** An officer who may approve claims but not change settings (an Accountant). */
  | { status: 'not-director'; verdict: SrpOfficerVerdict }
  /** SRP was never turned on here: the first-time state. */
  | { status: 'never-on'; verdict: SrpOfficerVerdict }
  | { status: 'ready'; verdict: SrpOfficerVerdict; settings: SrpSettings };

export interface SrpSettingsData {
  state: SrpSettingsState;
  characterId: number | null;
  corporationId: number | null;
  reload: () => void;
  turnOn: () => Promise<void>;
  /** Saves the patch, then turns SRP on or off when `enabled` differs from the saved flag. */
  save: (patch: SrpSettingsPatch, enabled: boolean | null) => Promise<void>;
  reclaim: () => Promise<void>;
}

const DENIED = /permission-denied|unauthenticated|failed-precondition/;

export function useSrpSettings(): SrpSettingsData {
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const [state, setState] = useState<SrpSettingsState>({ status: 'loading' });
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
        const settings = await readSrpSettings(characterId, corporationId);
        if (cancelled) return;
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
  }, [characterId, corporationId, attempt]);

  const turnOn = useCallback(async () => {
    if (characterId === null || corporationId === null) return;
    await turnOnSrp(characterId, corporationId);
    reload();
  }, [characterId, corporationId, reload]);

  const save = useCallback(
    async (patch: SrpSettingsPatch, enabled: boolean | null) => {
      if (characterId === null || corporationId === null) return;
      try {
        if (Object.keys(patch).length > 0) await saveSrpSettings(characterId, corporationId, patch);
        if (enabled === true) await turnOnSrp(characterId, corporationId);
        if (enabled === false) await turnOffSrp(characterId, corporationId);
      } finally {
        // Even a half-done save changed something: show what the server holds.
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
