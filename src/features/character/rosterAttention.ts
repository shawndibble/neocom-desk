import { db, type CharacterRecord } from '@/db';
import { readCachedRows } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { CharacterPlanet, CharacterPlanetDetail, IndustryJob } from '@/esi/endpoints';
import { loadCharacterIndustryJobs, KEYS as JOBS_KEYS } from '@/features/industry/jobs';
import {
  loadCharacterPlanets,
  loadAllColonyDetails,
  readCachedColonyDetails,
  KEYS as PI_KEYS,
} from '@/features/pi/data';
import { colonyStatusFromPins } from '@/engine/pi/colonyPins';
import { colonyAttention, sortColoniesByAttention } from '@/engine/pi/colonyStatus';
import type { ColonyAttention, ColonyStatus } from '@/engine/pi/types';
import { runningJobCountsByCategory, type JobSlotCategory } from '@/engine/industry/jobSlots';
import { toJobSlotJobs } from '@/features/character/jobSlotSkills';

const JOBS_SCOPE = ESI_REGISTRY.getCharacterIndustryJobs.scope;
const PLANETS_SCOPE = ESI_REGISTRY.getCharacterPlanets.scope;

export interface AttentionEntry {
  characterId: number;
  jobCounts: Record<JobSlotCategory, number> | undefined;
  jobCountsFetchedAt: Date | null;
  piAttention: ColonyAttention | undefined;
  piSoonestExpiryMs: number | null | undefined;
  piFetchedAt: Date | null;
}

export function isPiExpired(expiryMs: number | null | undefined, nowMs: number): boolean {
  return expiryMs != null && expiryMs <= nowMs;
}

function emptyEntry(characterId: number): AttentionEntry {
  return {
    characterId,
    jobCounts: undefined,
    jobCountsFetchedAt: null,
    piAttention: undefined,
    piSoonestExpiryMs: undefined,
    piFetchedAt: null,
  };
}

async function grantedScopesByCharacter(
  characters: readonly CharacterRecord[]
): Promise<Map<number, readonly string[]>> {
  const map = new Map<number, readonly string[]>();
  await Promise.all(
    characters.map(async (character) => {
      const token = await db.tokens.get(character.characterId);
      map.set(character.characterId, token?.scopes ?? []);
    })
  );
  return map;
}

function worstColonyStatus(statuses: readonly ColonyStatus[], nowMs: number): ColonyStatus {
  const [worst] = sortColoniesByAttention(statuses, (status) => status, nowMs);
  return worst;
}

function statusFromPins(
  pins: CharacterPlanetDetail['pins'] | undefined,
  nowMs: number
): ColonyStatus {
  return colonyStatusFromPins(pins ?? [], nowMs);
}

async function cacheOnlyAttention(
  characters: readonly CharacterRecord[],
  nowMs: number
): Promise<AttentionEntry[]> {
  const ids = characters.map((c) => c.characterId);
  const [scopes, jobRows, planetRows] = await Promise.all([
    grantedScopesByCharacter(characters),
    readCachedRows<IndustryJob[]>(ids, JOBS_KEYS.jobs),
    readCachedRows<CharacterPlanet[]>(ids, PI_KEYS.planets),
  ]);

  return Promise.all(
    characters.map(async (character) => {
      const entry = emptyEntry(character.characterId);
      const granted = scopes.get(character.characterId) ?? [];

      if (granted.includes(JOBS_SCOPE)) {
        const jobsRow = jobRows.get(character.characterId);
        if (jobsRow) {
          entry.jobCounts = runningJobCountsByCategory(toJobSlotJobs(jobsRow.data), nowMs);
          entry.jobCountsFetchedAt = jobsRow.fetchedAt;
        }
      }

      if (granted.includes(PLANETS_SCOPE)) {
        const planetsRow = planetRows.get(character.characterId);
        if (planetsRow) {
          entry.piFetchedAt = planetsRow.fetchedAt;
          const planets = planetsRow.data;
          if (planets.length > 0) {
            const details = await readCachedColonyDetails(
              character.characterId,
              planets.map((p) => p.planet_id)
            );
            const statuses = planets.map((planet) =>
              statusFromPins(details.get(planet.planet_id)?.data.pins, nowMs)
            );
            const worst = worstColonyStatus(statuses, nowMs);
            entry.piAttention = colonyAttention(worst, nowMs);
            entry.piSoonestExpiryMs = worst.soonestExpiryMs;
          }
        }
      }

      return entry;
    })
  );
}

async function liveAttention(
  characters: readonly CharacterRecord[],
  nowMs: number
): Promise<AttentionEntry[]> {
  const scopes = await grantedScopesByCharacter(characters);
  const entries = characters.map((c) => emptyEntry(c.characterId));

  const requests: (() => Promise<void>)[] = [];
  characters.forEach((character, index) => {
    const granted = scopes.get(character.characterId) ?? [];

    if (granted.includes(JOBS_SCOPE)) {
      requests.push(async () => {
        const result = await loadCharacterIndustryJobs(character.characterId);
        if (!result.cached) return;
        entries[index].jobCounts = runningJobCountsByCategory(
          toJobSlotJobs(result.cached.data),
          nowMs
        );
        entries[index].jobCountsFetchedAt = result.cached.fetchedAt;
      });
    }

    if (granted.includes(PLANETS_SCOPE)) {
      requests.push(async () => {
        const planetsResult = await loadCharacterPlanets(character.characterId);
        if (!planetsResult.cached) return;
        entries[index].piFetchedAt = planetsResult.cached.fetchedAt;
        const planets = planetsResult.cached.data;
        if (planets.length === 0) return;
        const details = await loadAllColonyDetails(
          character.characterId,
          planets.map((p) => p.planet_id)
        );
        const statuses = planets.map((planet) =>
          statusFromPins(details.get(planet.planet_id)?.cached?.data.pins, nowMs)
        );
        const worst = worstColonyStatus(statuses, nowMs);
        entries[index].piAttention = colonyAttention(worst, nowMs);
        entries[index].piSoonestExpiryMs = worst.soonestExpiryMs;
      });
    }
  });

  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch {}
  });

  return entries;
}

export async function loadRosterAttention(opts?: {
  live?: boolean;
  now?: number;
}): Promise<AttentionEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];
  const nowMs = opts?.now ?? Date.now();
  return opts?.live ? liveAttention(characters, nowMs) : cacheOnlyAttention(characters, nowMs);
}
