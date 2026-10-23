/**
 * The corp's Doctrine Fits for the settings page. Kept apart from `useSrpSettings`: a settings
 * reload remounts the form and drops unsaved edits, and adding or deleting a fit must not.
 */
import { useCallback, useEffect, useState } from 'react';
import { deleteSrpDoctrine, readSrpDoctrines, saveSrpDoctrine } from '../srpDoctrineClient';
import type { DoctrineFit, SaveDoctrineInput } from '../srpTypes';

export type DoctrinesState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; fits: DoctrineFit[] };

export interface SrpDoctrines {
  state: DoctrinesState;
  reload: () => void;
  add: (input: SaveDoctrineInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useSrpDoctrines(characterId: number, corporationId: number): SrpDoctrines {
  const key = `${characterId}:${corporationId}`;
  const [loaded, setLoaded] = useState<{ key: string; state: DoctrinesState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state: DoctrinesState =
    loaded !== null && loaded.key === key ? loaded.state : { status: 'loading' };

  useEffect(() => {
    let cancelled = false;
    readSrpDoctrines(characterId, corporationId).then(
      (fits) => !cancelled && setLoaded({ key, state: { status: 'ready', fits } }),
      () => !cancelled && setLoaded({ key, state: { status: 'failed' } })
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const add = useCallback(
    async (input: SaveDoctrineInput) => {
      await saveSrpDoctrine(characterId, corporationId, input);
      reload();
    },
    [characterId, corporationId, reload]
  );
  const remove = useCallback(
    async (id: string) => {
      await deleteSrpDoctrine(characterId, corporationId, id);
      reload();
    },
    [characterId, corporationId, reload]
  );
  return { state, reload, add, remove };
}
