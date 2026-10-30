/**
 * The places a Survey's location can name: the ones ESI's waypoint call takes
 * (a solar system, an NPC station or a player structure). Asteroid belts and ice
 * fields are celestials the call refuses, so the system is as close as a Survey
 * gets to one.
 *
 * Systems and NPC stations come from the local snapshot, so typing costs no ESI
 * request. So do structures this device has already named. Any other structure
 * needs `GET /characters/{id}/search`, which answers with ids alone, so each hit
 * is a further ACL-checked lookup.
 *
 * A pilot pastes a structure's full name ("Ainsan - Mav's Watering Hole"), and
 * ESI's search can find nothing for that exact text when a word-by-word query
 * finds it. So names are compared with case, accents and punctuation folded away,
 * and a search that comes back empty is asked again more loosely.
 */
import { getCharacterSearch } from '@/esi/endpoints';
import { listCachedStructures, loadStructureSummary } from '@/features/character/structures';
import { rankedSearch } from '@/lib/rankedSearch';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';

export type SurveyPlaceKind = 'system' | 'station' | 'structure' | 'manual';

export interface SurveyPlace {
  /** `null` for a manual place: free text with nothing to resolve. */
  id: number | null;
  name: string;
  kind: SurveyPlaceKind;
  /** Systems only, for the security tag beside the name. */
  security?: number;
}

/** ESI's own floor: below it the search endpoint 400s, so it is never called. */
export const MIN_STRUCTURE_SEARCH_LENGTH = 3;

const SYSTEM_LIMIT = 5;
// Every NPC station matching what was typed is offered; the list scrolls.
const STATION_LIMIT = 50;
const STRUCTURE_LIMIT = 20;

// Apostrophes vanish ("Mav's" folds to "mavs"); any other mark splits words.
const APOSTROPHES = /['’‘`ʼ]/g;
const NOT_WORD = /[^\p{L}\p{N}]+/gu;
const ACCENTS = /\p{M}/gu;
// What sits between the system and the name in every structure's name.
const SYSTEM_SEPARATOR = /\s+[-–—]\s+/;

/** A name for comparing: lower case, no accents, no punctuation, single spaces. */
export function foldPlaceName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(NOT_WORD, ' ')
    .trim();
}

/** Every typed word starts a word of the name, in any order; punctuation and case don't count. */
export function matchesPlace(name: string, query: string): boolean {
  const words = foldPlaceName(query).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const nameWords = foldPlaceName(name).split(' ');
  return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)));
}

/** The place is named exactly what was typed, once case and punctuation are folded away. */
export function isExactPlace(place: SurveyPlace, query: string): boolean {
  const folded = foldPlaceName(query);
  return folded !== '' && foldPlaceName(place.name) === folded;
}

/** The places named exactly what was typed (folded) first; the rest keep their order. */
export function rankExactFirst(places: readonly SurveyPlace[], query: string): SurveyPlace[] {
  const exact = places.filter((place) => isExactPlace(place, query));
  return exact.length === 0
    ? [...places]
    : [...exact, ...places.filter((place) => !isExactPlace(place, query))];
}

// Any mark but a letter, digit or space: what splits a name into verbatim runs.
const PUNCTUATION = /[^\p{L}\p{N}\s]+/u;

/** The longest stretch of the text with no punctuation, a lone letter at either end dropped. */
function longestPlainRun(text: string): string {
  const runs = text.split(PUNCTUATION).map((run) => {
    const words = run.trim().split(/\s+/);
    while (words.length > 0 && words[0].length < 2) words.shift();
    while (words.length > 0 && words[words.length - 1].length < 2) words.pop();
    return words.join(' ');
  });
  return runs.reduce((longest, run) => (run.length > longest.length ? run : longest), '');
}

/**
 * The queries to put to ESI's search, tightest first. Whether ESI matches a
 * substring or word by word, one of them should land: what was typed, the name
 * after the system, the longest stretch with no punctuation (each copied from the
 * name, so a substring of it), the words without punctuation (a possessive's lone
 * "s" dropped), then the system alone. Each below ESI's floor is skipped.
 */
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

/** Systems first (the usual pick for ice and asteroids), then NPC stations. */
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

/** Known structures then ESI's hits, each structure once. */
export function mergeStructures(
  known: readonly SurveyPlace[],
  found: readonly SurveyPlace[]
): SurveyPlace[] {
  const ids = new Set(known.map((place) => place.id));
  return [...known, ...found.filter((place) => !ids.has(place.id))];
}

/** What was typed, offered as a free-text place when no result already carries that name. */
export function manualPlaceOption(
  found: readonly SurveyPlace[],
  query: string
): SurveyPlace | null {
  const name = query.trim();
  if (name === '') return null;
  if (found.some((place) => isExactPlace(place, name))) return null;
  return { id: null, name, kind: 'manual' };
}

/**
 * A matcher over the structures this device has already named, for every
 * keystroke with no request. Read once; a name resolved later shows from the
 * next read.
 */
export async function searchCachedStructures(): Promise<(query: string) => SurveyPlace[]> {
  const known = await listCachedStructures();
  return (query) =>
    known
      .filter((structure) => matchesPlace(structure.name, query))
      .slice(0, STRUCTURE_LIMIT)
      .map((structure): SurveyPlace => ({ ...structure, kind: 'structure' }));
}

/**
 * The structures this Character can dock at whose name matches. A refused or
 * failed lookup is just fewer results. When ESI finds nothing for what was typed,
 * each looser query in turn is asked, keeping only the hits whose name matches
 * the full text, so asking by the system alone never floods the list. The first
 * query ESI answers with any ids is the last one asked, even when every lookup
 * is refused, so a search costs at most one round of lookups.
 */
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
