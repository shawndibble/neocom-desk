/**
 * Keeps one shared Survey's scans fresh: loads it, then re-reads every
 * `SURVEY_POLL_MS` while the tab is visible, because other people may be
 * adding scans (the Firestore lite SDK has no live listener).
 */
import { useCallback, useEffect, useState } from 'react';
import type { SurveyScan } from '@/engine/survey/series';
import { loadSurvey, type LoadSurveyResult } from './surveyStore';

export const SURVEY_POLL_MS = 20_000;

export type SurveyLoadState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; scans: SurveyScan[]; expiresAt: number }
  | { status: 'gone' }
  | { status: 'failed' };

type Loaded = { id: string; result: LoadSurveyResult } | null;

export function useSurvey(id: string | null): {
  state: SurveyLoadState;
  refresh: () => Promise<void>;
} {
  const [loaded, setLoaded] = useState<Loaded>(null);

  const refresh = useCallback(async () => {
    if (id === null) return;
    const result = await loadSurvey(id);
    setLoaded({ id, result });
  }, [id]);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    const run = () => {
      void loadSurvey(id).then((result) => {
        if (!cancelled) setLoaded({ id, result });
      });
    };
    run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, SURVEY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id]);

  if (id === null) return { state: { status: 'none' }, refresh };
  // A result for another id (the pilot switched surveys) is stale.
  const result = loaded?.id === id ? loaded.result : null;
  if (result === null) return { state: { status: 'loading' }, refresh };
  if (result.ok) {
    return {
      state: { status: 'ready', scans: result.scans, expiresAt: result.expiresAt },
      refresh,
    };
  }
  return { state: { status: result.reason === 'not-found' ? 'gone' : 'failed' }, refresh };
}
