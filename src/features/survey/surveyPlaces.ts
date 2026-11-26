import { getCharacterSearch } from '@/esi/endpoints';
import { listCachedStructures, loadStructureSummary } from '@/features/character/structures';
import { rankedSearch } from '@/lib/rankedSearch';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';

export type SurveyPlaceKind = 'system' | 'station' | 'structure' | 'manual';

export interface SurveyPlace {
  id: number | null;
  name: string;
  kind: SurveyPlaceKind;
  security?: number;
}

export const MIN_STRUCTURE_SEARCH_LENGTH = 3;

const SYSTEM_LIMIT = 5;
const STATION_LIMIT = 50;
const STRUCTURE_LIMIT = 20;

const APOSTROPHES = /['’‘`ʼ]/g;
const NOT_WORD = /[^\p{L}\p{N}]+/gu;
const ACCENTS = /\p{M}/gu;
const SYSTEM_SEPARATOR = /\s+[-–—]\s+/;

export function foldPlaceName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(NOT_WORD, ' ')
    .trim();
}

export function matchesPlace(name: string, query: string): boolean {
  const words = foldPlaceName(query).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const nameWords = foldPlaceName(name).split(' ');
  return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)));
}

export function isExactPlace(place: SurveyPlace, query: string): boolean {
  const folded = foldPlaceName(query);
  return folded !== '' && foldPlaceName(place.name) === folded;
}

export function rankExactFirst(places: readonly SurveyPlace[], query: string): SurveyPlace[] {
  const exact = places.filter((place) => isExactPlace(place, query));
  return exact.length === 0
    ? [...places]
    : [...exact, ...places.filter((place) => !isExactPlace(place, query))];
}

const PUNCTUATION = /[^\p{L}\p{N}\s]+/u;

function longestPlainRun(text: string): string {
  const runs = text.split(PUNCTUATION).map((run) => {
    const words = run.trim().split(/\s+/);
    while (words.length > 0 && words[0].length < 2) words.shift();
    while (words.length > 0 && words[words.length - 1].length < 2) words.pop();
    return words.join(' ');
  });
  return runs.reduce((longest, run) => (run.length > longest.length ? run : longest), '');
}

export function structureSearchTerms(query: string): string[] {
  const typed = query.trim();
  const words = typed
    .replace(APOSTROPHES, ' ')
    .split(NOT_WORD)
    .filter((word) => word.length > 1)
    .join(' ');
  const [system, ...rest] = typed.split(SYSTEM_SEPARATOR);
  const named = rest.length > 0;
  const candidates = [
    typed,
    named ? rest.join(' - ') : '',
    longestPlainRun(typed),
    words,
    named ? system : '',
  ];
  const terms: string[] = [];
  for (const term of candidates) {
    const seen = terms.some((t) => t.toLowerCase() === term.toLowerCase());
    if (term.length >= MIN_STRUCTURE_SEARCH_LENGTH && !seen) terms.push(term);
  }
  return terms;
}

export function searchLocalPlaces(
  systems: readonly SolarSystemEntry[],
  stations: readonly NpcStationEntry[],
  query: string
): SurveyPlace[] {
  const foundSystems = rankedSearch(systems, query, {
    primary: (s) => s.name,
    ignoreSeparators: true,
    limit: SYSTEM_LIMIT,
  }).map((s): SurveyPlace => ({ id: s.id, name: s.name, kind: 'system', security: s.security }));
  const foundStations = rankedSearch(stations, query, {
    primary: (s) => s.name,
    limit: STATION_LIMIT,
  }).map((s): SurveyPlace => ({ id: s.id, name: s.name, kind: 'station' }));
  return [...foundSystems, ...foundStations];
}

export function mergeStructures(
  known: readonly SurveyPlace[],
  found: readonly SurveyPlace[]
): SurveyPlace[] {
  const ids = new Set(known.map((place) => place.id));
  return [...known, ...found.filter((place) => !ids.has(place.id))];
}

export function manualPlaceOption(
  found: readonly SurveyPlace[],
  query: string
): SurveyPlace | null {
  const name = query.trim();
  if (name === '') return null;
  if (found.some((place) => isExactPlace(place, name))) return null;
  return { id: null, name, kind: 'manual' };
}

export async function searchCachedStructures(): Promise<(query: string) => SurveyPlace[]> {
  const known = await listCachedStructures();
  return (query) =>
    known
      .filter((structure) => matchesPlace(structure.name, query))
      .slice(0, STRUCTURE_LIMIT)
      .map((structure): SurveyPlace => ({ ...structure, kind: 'structure' }));
}

export async function searchStructures(
  characterId: number,
  query: string,
  signal?: AbortSignal
): Promise<SurveyPlace[]> {
  const [typed, ...looser] = structureSearchTerms(query);
  if (typed === undefined) return [];
  for (const term of [typed, ...looser]) {
    const hits = (await getCharacterSearch(characterId, ['structure'], term, { signal })).data;
    if (signal?.aborted) return [];
    const ids = (hits?.structure ?? []).slice(0, STRUCTURE_LIMIT);
    if (ids.length === 0) continue;
    const resolved = await Promise.all(
      ids.map(async (id): Promise<SurveyPlace | null> => {
        const summary = await loadStructureSummary(characterId, id).catch(() => null);
        return summary === null ? null : { id, name: summary.name, kind: 'structure' };
      })
    );
    return resolved.filter(
      (place): place is SurveyPlace =>
        place !== null && (term === typed || matchesPlace(place.name, query))
    );
  }
  return [];
}
