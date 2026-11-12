/**
 * `/corp/vetting`'s data: the corp's settings and its reviews, for the signed-in reviewer. Tagged
 * with the Character and corporation it was read for, so a switch shows loading, never another
 * corp's queue. Changes (a request, a settings save) answer with the new overview, which
 * replaces what is on screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VettingOverview } from '@/engine/vetting';
import { callableErrorCode } from '@/lib/callableError';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { vettingBackend } from './vettingClient';

export type VettingOverviewState =
  | { status: 'loading' }
  /** The server says this Character is no reviewer (roles changed since the page's gate read them). */
  | { status: 'denied' }
  | { status: 'failed' }
  | { status: 'ready'; overview: VettingOverview };

export interface VettingOverviewData {
  state: VettingOverviewState;
  characterId: number | null;
  corporationId: number | null;
  reload: () => void;
  /** Puts an overview a change answered with on screen. */
  replace: (overview: VettingOverview) => void;
}

export function useVettingOverview(): VettingOverviewData {
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const key =
    characterId === null || corporationId === null ? null : `${characterId}:${corporationId}`;
  const [loaded, setLoaded] = useState<{ key: string; state: VettingOverviewState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state = useMemo<VettingOverviewState>(
    () => (loaded !== null && loaded.key === key ? loaded.state : { status: 'loading' }),
    [loaded, key]
  );

  useEffect(() => {
    if (characterId === null || corporationId === null || key === null) return;
    let cancelled = false;
    vettingBackend()
      .overview(characterId, corporationId)
      .then(
        (overview) => {
          if (!cancelled) setLoaded({ key, state: { status: 'ready', overview } });
        },
        (error: unknown) => {
          if (cancelled) return;
          const denied = callableErrorCode(error) === 'permission-denied';
          setLoaded({ key, state: { status: denied ? 'denied' : 'failed' } });
        }
      );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, key, attempt]);

  const reload = useCallback(() => {
    setLoaded(null);
    setAttempt((n) => n + 1);
  }, []);
  const replace = useCallback(
    (overview: VettingOverview) => {
      if (key !== null) setLoaded({ key, state: { status: 'ready', overview } });
    },
    [key]
  );

  return { state, characterId, corporationId, reload, replace };
}
