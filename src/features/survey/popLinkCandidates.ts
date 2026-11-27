import { moonOreBaseOf } from '@/engine/corpTaxBook/moonOreVariants';
import { classifyPlaceId } from '@/features/places/classify';
import { sharedPopIsShown, sharedPopShownAtMs } from '@/features/character/calendarSharedPops';
import type { InfoLocation } from '@/engine/survey/infoTemplate';
import type { SharedPopView } from '@/sync/sharedPops';
import type { SurveyTaxShare } from './surveyStore';

export interface PopLinkCandidate {
  pop: SharedPopView;
  score: number | null;
}

const baseSet = (typeIds: Iterable<number>): Set<number> =>
  new Set([...typeIds].map(moonOreBaseOf));

function overlap(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  const shared = [...a].filter((id) => b.has(id)).length;
  return shared / (a.size + b.size - shared);
}

function atPlace(pop: SharedPopView, location: InfoLocation | null): boolean {
  const id = location?.id ?? null;
  if (id === null) return true;
  const kind = classifyPlaceId(id);
  if (kind === 'solar_system') return pop.solarSystemId === id;
  if (kind === 'structure') return pop.structureId === id;
  return true;
}

function readyAtMs(pop: SharedPopView): number {
  return sharedPopShownAtMs(pop, 'ready');
}

export function popLinkCandidates({
  pops,
  scanOreIds,
  location,
  now,
}: {
  pops: readonly SharedPopView[];
  scanOreIds: ReadonlySet<number>;
  location: InfoLocation | null;
  now: number;
}): PopLinkCandidate[] {
  const scan = baseSet(scanOreIds);
  return pops
    .filter(
      (pop) =>
        !pop.surveyId &&
        !pop.fullyMined &&
        sharedPopIsShown(pop, now) &&
        now < Date.parse(pop.expiresAt) &&
        readyAtMs(pop) <= now &&
        atPlace(pop, location)
    )
    .map((pop): PopLinkCandidate => ({
      pop,
      score:
        pop.ore === null || scan.size === 0
          ? null
          : overlap(scan, baseSet(pop.ore.map((o) => o.typeId))),
    }))
    .filter((c) => c.score !== 0)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || readyAtMs(b.pop) - readyAtMs(a.pop));
}

export function strongPopMatch(candidates: readonly PopLinkCandidate[]): PopLinkCandidate | null {
  const [best, next] = candidates;
  if (!best || best.score !== 1) return null;
  return next?.score === 1 ? null : best;
}

export interface PopSurveyDetails {
  place: InfoLocation | null;
  payee: SurveyTaxShare | null;
}

export function popSurveyDetails(
  pop: SharedPopView,
  refineryOrMoonName: string | null,
  corporationName: string | null
): PopSurveyDetails {
  const name = refineryOrMoonName?.trim() ?? '';
  const corporation = corporationName?.trim() ?? '';
  return {
    place: name === '' ? null : { id: pop.structureId, name },
    payee:
      corporation === '' || corporation === String(pop.corporationId)
        ? null
        : { name: corporation, pct: pop.ratePct },
  };
}

export interface PopFill {
  location?: InfoLocation;
  tax?: SurveyTaxShare;
}

export function popSurveyFill(
  details: PopSurveyDetails,
  current: { location: InfoLocation | null; tax: SurveyTaxShare | null }
): PopFill {
  return {
    ...(current.location === null && details.place ? { location: details.place } : {}),
    ...(current.tax === null && details.payee ? { tax: details.payee } : {}),
  };
}
