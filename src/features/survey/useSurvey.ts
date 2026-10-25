/**
 * Keeps one shared Survey's scans fresh: loads it, then re-reads every
 * `SURVEY_POLL_MS` while the tab is visible, because other people may be
 * adding scans (the Firestore lite SDK has no live listener). Once no new scan
 * has come in for `SURVEY_IDLE_AFTER_MS` it slows to `SURVEY_IDLE_POLL_MS`:
 * every poll is billed, and a page left open beside a finished field would
 * otherwise read all day. Coming back to the tab or window re-reads at once: a
 * hidden tab skips its ticks, and the page often sits beside the game client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SurveyScan } from '@/engine/survey/series';
import {
  loadSurvey,
  type LoadSurveyResult,
  type SurveyInfoShare,
  type SurveyTaxShare,
} from './surveyStore';

export const SURVEY_POLL_MS = 30_000;
/** The slower poll once the field has gone quiet. */
export const SURVEY_IDLE_POLL_MS = 120_000;
/** How long without a new scan before the poll slows down. */
export const SURVEY_IDLE_AFTER_MS = 5 * 60_000;

/** The wait before the next poll, given how long ago the last new scan came in. */
export function surveyPollDelay(sinceNewScanMs: number): number {
  return sinceNewScanMs >= SURVEY_IDLE_AFTER_MS ? SURVEY_IDLE_POLL_MS : SURVEY_POLL_MS;
}
/** A return to the tab re-reads unless one just did. */
const RETURN_MIN_GAP_MS = 5_000;

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
 * (or swapped for an error and back) on every poll. Scans only ever get
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
  // How many scans the last load saw, and when that count last changed: the poll's pace.
  const activity = useRef({ count: -1, at: 0 });

  const take = useCallback((forId: string, result: LoadSurveyResult) => {
    if (result.ok && result.scans.length !== activity.current.count) {
      activity.current = { count: result.scans.length, at: Date.now() };
    }
    setLoaded((prev) => settle(prev, forId, result));
  }, []);

  const refresh = useCallback(async () => {
    if (id === null) return;
    take(id, await loadSurvey(id));
  }, [id, take]);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    let lastRunAt = 0;
    activity.current = { count: -1, at: Date.now() };
    const run = () => {
      lastRunAt = Date.now();
      return loadSurvey(id)
        .then((result) => {
          if (!cancelled) take(id, result);
        })
        .catch(() => undefined);
    };
    let timer = 0;
    // Each wait starts once the last poll has answered, so a scan it found speeds up the next.
    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(
        () => {
          if (document.visibilityState === 'visible') void run().then(schedule);
          else schedule();
        },
        surveyPollDelay(Date.now() - activity.current.at)
      );
    };
    void run().then(schedule);
    const onReturn = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunAt >= RETURN_MIN_GAP_MS) {
        void run();
      }
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [id, take]);

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
