/**
 * Keeps one shared Survey's scans fresh: loads it, then re-reads every
 * `SURVEY_POLL_MS` while the tab is visible, because other people may be
 * adding scans (the Firestore lite SDK has no live listener).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SurveyScan } from '@/engine/survey/series';
import {
  loadSurvey,
  type LoadSurveyResult,
  type SurveyInfoShare,
  type SurveyTaxShare,
} from './surveyStore';

export const SURVEY_POLL_MS = 60_000;

export type SurveyLoadState =
  | { status: 'none' }
  | { status: 'loading' }
  | {
      status: 'ready';
      scans: SurveyScan[];
      expiresAt: number;
      owner: string | null;
      tax: SurveyTaxShare | null;
      info: SurveyInfoShare | null;
      ignored: ReadonlySet<string>;
    }
  | { status: 'gone' }
  | { status: 'failed' };

type Loaded = { id: string; result: LoadSurveyResult } | null;

/**
 * What a poll should leave on screen. A poll that finds nothing new, or that
 * fails for a moment, keeps the very same state, so the page isn't re-rendered
 * (or swapped for an error and back) every minute. Scans only ever get
 * appended, so a matching count and times, and the same ignored set, mean nothing changed.
 */
function settle(prev: Loaded, id: string, result: LoadSurveyResult): Loaded {
  const before = prev?.id === id ? prev.result : null;
  if (before?.ok) {
    if (!result.ok && result.reason === 'failed') return prev;
    if (
      result.ok &&
      result.expiresAt === before.expiresAt &&
      result.owner === before.owner &&
      result.tax?.name === before.tax?.name &&
      result.tax?.pct === before.tax?.pct &&
      result.info?.notes === before.info?.notes &&
      result.info?.location?.id === before.info?.location?.id &&
      result.info?.location?.name === before.info?.location?.name &&
      result.ignored.size === before.ignored.size &&
      [...result.ignored].every((scanId) => before.ignored.has(scanId)) &&
      result.scans.length === before.scans.length &&
      result.scans.every((scan, i) => scan.at === before.scans[i].at)
    ) {
      return prev;
    }
  }
  return { id, result };
}

export function useSurvey(id: string | null): {
  state: SurveyLoadState;
  refresh: () => Promise<void>;
} {
  const [loaded, setLoaded] = useState<Loaded>(null);

  const refresh = useCallback(async () => {
    if (id === null) return;
    const result = await loadSurvey(id);
    setLoaded((prev) => settle(prev, id, result));
  }, [id]);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    const run = () => {
      void loadSurvey(id).then((result) => {
        if (!cancelled) setLoaded((prev) => settle(prev, id, result));
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

  const state = useMemo<SurveyLoadState>(() => {
    if (id === null) return { status: 'none' };
    // A result for another id (the pilot switched surveys) is stale.
    const result = loaded?.id === id ? loaded.result : null;
    if (result === null) return { status: 'loading' };
    if (result.ok) {
      return {
        status: 'ready',
        scans: result.scans,
        expiresAt: result.expiresAt,
        owner: result.owner,
        tax: result.tax,
        info: result.info,
        ignored: result.ignored,
      };
    }
    return { status: result.reason === 'not-found' ? 'gone' : 'failed' };
  }, [id, loaded]);
  return { state, refresh };
}
