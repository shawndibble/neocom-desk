import { useCallback, useState } from 'react';
import { sharedPopTitle, type SharedPopEntry } from '@/features/character/calendarSharedPops';
import { loadSharedPopsRead } from '@/features/character/calendarSharedPopsRead';
import { loadMoonOreTypeIdByName } from '@/features/corp/moons/keptSurveyScan';
import type { InfoLocation } from '@/engine/survey/infoTemplate';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { linkSharedPopSurvey } from '@/sync/sharedPops';
import { popLinkCandidates, strongPopMatch, type PopLinkCandidate } from './popLinkCandidates';

const FORCE_RELOAD_MS = 0;

export interface PopLinkOption {
  id: string;
  title: string;
  corporation: string;
  score: number | null;
}

export interface PopLinkState {
  options: PopLinkOption[];
  strong: PopLinkOption | null;
  link: (popId: string) => Promise<void>;
  linkFailed: boolean;
}

const optionOf = (
  candidate: PopLinkCandidate,
  entries: readonly SharedPopEntry[]
): PopLinkOption => {
  const entry = entries.find((e) => e.pop.id === candidate.pop.id);
  return {
    id: candidate.pop.id,
    title: entry ? sharedPopTitle(entry) : `#${candidate.pop.structureId}`,
    corporation: entry?.corporation.name ?? String(candidate.pop.corporationId),
    score: candidate.score,
  };
};

const isAlreadyLinked = (error: unknown): boolean => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return (
    String(code ?? '').endsWith('failed-precondition') &&
    String(message ?? '').includes('already linked')
  );
};

export function usePopLinkPrompt({
  surveyId,
  oreNames,
  location,
  enabled,
}: {
  surveyId: string;
  oreNames: readonly string[];
  location: InfoLocation | null;
  enabled: boolean;
}): PopLinkState | null {
  const [attempt, setAttempt] = useState(0);
  const [linkFailed, setLinkFailed] = useState(false);
  const oreKey = [...new Set(oreNames)].sort().join('\n');
  const loader = useCallback(async () => {
    const now = Date.now();
    const [read, idByName] = await Promise.all([
      loadSharedPopsRead(now, attempt === 0 ? undefined : FORCE_RELOAD_MS),
      loadMoonOreTypeIdByName(),
    ]);
    return { now, entries: read.entries ?? [], idByName };
  }, [attempt]);
  const load = useKeyedLoad(enabled ? `${surveyId}:${oreKey}:${attempt}` : null, loader);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  const link = useCallback(
    async (popId: string) => {
      setLinkFailed(false);
      try {
        await linkSharedPopSurvey(popId, surveyId, { onlyIfUnlinked: true });
      } catch (error) {
        if (!isAlreadyLinked(error)) {
          setLinkFailed(true);
          return;
        }
      }
      refresh();
    },
    [surveyId, refresh]
  );
  if (load.status !== 'ready') return null;
  const { now, entries, idByName } = load.data;
  if (entries.some((e) => e.pop.surveyId === surveyId)) return null;
  const scanOreIds = new Set(oreNames.flatMap((name) => idByName.get(name) ?? []));
  const candidates = popLinkCandidates({
    pops: entries.map((e) => e.pop),
    scanOreIds,
    location,
    now,
  });
  const strong = strongPopMatch(candidates);
  return {
    options: candidates.map((c) => optionOf(c, entries)),
    strong: strong ? optionOf(strong, entries) : null,
    link,
    linkFailed,
  };
}
