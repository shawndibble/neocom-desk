import { useCallback, useState } from 'react';
import { sharedPopTitle, type SharedPopEntry } from '@/features/character/calendarSharedPops';
import { loadSharedPopsRead } from '@/features/character/calendarSharedPopsRead';
import { loadMoonOreTypeIdByName } from '@/features/corp/moons/keptSurveyScan';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { linkSharedPopSurvey } from '@/sync/sharedPops';
import { applyPopFill } from './applyPopFill';
import type { InfoSurvey } from './SurveyInfoPanel';
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
  link: (option: PopLinkOption) => Promise<void>;
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
      entry?.corporation.name ?? null
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
  survey,
  characterId,
  oreNames,
  enabled,
  onStored,
}: {
  survey: InfoSurvey;
  characterId: number;
  oreNames: readonly string[];
  enabled: boolean;
  onStored: () => void;
}): PopLinkState | null {
  const surveyId = survey.id;
  const location = survey.info?.location ?? null;
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
    async (option: PopLinkOption) => {
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
      await applyPopFill(survey, characterId, option.details);
      onStored();
      refresh();
    },
    [survey, surveyId, characterId, onStored, refresh]
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
