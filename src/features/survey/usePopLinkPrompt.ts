import { useCallback, useState } from 'react';
import { sharedPopTitle, type SharedPopEntry } from '@/features/character/calendarSharedPops';
import { loadSharedPopsRead } from '@/features/character/calendarSharedPopsRead';
import { loadMoonOreTypeIdByName } from '@/features/corp/moons/keptSurveyScan';
import type { InfoLocation } from '@/engine/survey/infoTemplate';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { linkSharedPopSurvey } from '@/sync/sharedPops';
import {
  popLinkCandidates,
  popSurveyDetails,
  strongPopMatch,
  type PopLinkCandidate,
  type PopSurveyDetails,
} from './popLinkCandidates';

const FORCE_RELOAD_MS = 0;

export interface PopLinkOption {
  id: string;
  title: string;
  corporation: string;
  score: number | null;
  characterId?: number;
  details: PopSurveyDetails;
}

export interface PopLinkState {
  options: PopLinkOption[];
  strong: PopLinkOption | null;
  link: (option: PopLinkOption, afterLinked?: () => Promise<void>) => Promise<void>;
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
    characterId: candidate.pop.viewerCharacterIds?.[0],
    details: popSurveyDetails(
      candidate.pop,
      candidate.pop.refineryName ?? entry?.moonName ?? null,
      entry?.corporation.name ?? ''
    ),
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
  const [takenElsewhere, setTakenElsewhere] = useState(false);
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
    async (option: PopLinkOption, afterLinked?: () => Promise<void>) => {
      setLinkFailed(false);
      try {
        await linkSharedPopSurvey(option.id, surveyId, {
          onlyIfUnlinked: true,
          characterId: option.characterId,
        });
      } catch (error) {
        if (!isAlreadyLinked(error)) {
          setLinkFailed(true);
          return;
        }
        setTakenElsewhere(true);
        refresh();
        return;
      }
      await afterLinked?.();
      refresh();
    },
    [surveyId, refresh]
  );
  if (load.status !== 'ready' || takenElsewhere) return null;
  const { now, entries, idByName } = load.data;
  if (entries.some((e) => e.pop.surveyId === surveyId)) return null;
  const scanOreIds = new Set(oreNames.flatMap((name) => idByName.get(name) ?? []));
  const candidates = popLinkCandidates({
    pops: entries.map((e) => e.pop),
    scanOreIds,
    location,
    now,
  });
  const options = candidates.map((c) => optionOf(c, entries));
  const strong = strongPopMatch(candidates);
  const only = options.length === 1 ? options[0] : undefined;
  return {
    options,
    strong: strong ? optionOf(strong, entries) : (only ?? null),
    link,
    linkFailed,
  };
}
