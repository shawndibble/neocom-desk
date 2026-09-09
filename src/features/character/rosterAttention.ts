/**
 * Every Character's manufacturing and PI "needs attention" state at once, for
 * the Characters table view. A composition layer, not new infrastructure —
 * same shape as `roster.ts`: nothing here talks to ESI directly, it reads the
 * rows the per-character read-through loaders already write, or (in `live`
 * mode) calls those loaders themselves (docs/ARCHITECTURE.md §7 step 3: never
 * reimplement read-through).
 *
 * The planets scope is checked up front, per Character — same trap
 * `features/pi/roster.ts` documents: a live 403 raises the app-wide re-auth
 * banner naming an alt the player never asked about. A Character without a
 * scope reads as `undefined` for that column, same as one whose scoped read
 * simply hasn't been cached yet — the table draws both as a dash, and neither
 * is worth telling apart from the other in a glance view.
 */
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
import { extractorProgramsFromPins } from '@/features/pi/adapters';
import { colonyAttention, colonyStatus, sortColoniesByAttention } from '@/engine/pi/colonyStatus';
import type { ColonyAttention, ColonyStatus } from '@/engine/pi/types';
import { runningJobCountsByCategory, type JobSlotCategory } from '@/engine/industry/jobSlots';

const JOBS_SCOPE = ESI_REGISTRY.getCharacterIndustryJobs.scope;
const PLANETS_SCOPE = ESI_REGISTRY.getCharacterPlanets.scope;

export interface AttentionEntry {
  characterId: number;
  /** Running jobs per slot category. Undefined: no scope, or nothing cached yet. */
  jobCounts: Record<JobSlotCategory, number> | undefined;
  jobCountsFetchedAt: Date | null;
  /** Worst colony's attention. Undefined: no scope, no colonies, or nothing cached yet. */
  piAttention: ColonyAttention | undefined;
  piFetchedAt: Date | null;
}

function emptyEntry(characterId: number): AttentionEntry {
  return {
    characterId,
    jobCounts: undefined,
    jobCountsFetchedAt: null,
    piAttention: undefined,
    piFetchedAt: null,
  };
}

/** `IndustryJob[]` -> `engine/industry/jobSlots.ts`'s named shape, the ESI/engine boundary adaptation. */
function toJobSlotJobs(jobs: readonly IndustryJob[]) {
  return jobs.map((job) => ({ activityId: job.activity_id, endMs: Date.parse(job.end_date) }));
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

/** The worst attention across every colony a Character owns — same ranking `sortColoniesByAttention` sorts by, read off its first result rather than duplicated here. */
function worstAttention(statuses: readonly ColonyStatus[], nowMs: number): ColonyAttention {
  const [worst] = sortColoniesByAttention(statuses, (status) => status, nowMs);
  return colonyAttention(worst, nowMs);
}

function statusFromPins(
  pins: CharacterPlanetDetail['pins'] | undefined,
  nowMs: number
): ColonyStatus {
  return colonyStatus(extractorProgramsFromPins(pins ?? []), nowMs);
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
            entry.piAttention = worstAttention(statuses, nowMs);
          }
        }
      }

      return entry;
    })
  );
}

/**
 * Flattened to one entry per *request*, not per character — same reasoning as
 * `roster.ts`'s `loadLive`: `ESI_FANOUT_CONCURRENCY` caps requests in flight,
 * not characters, so a character needing both reads doesn't count double
 * against the cap. Each request settles on its own; a failing one leaves its
 * field at the `emptyEntry` default rather than sinking the character.
 */
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
        entries[index].piAttention = worstAttention(statuses, nowMs);
      });
    }
  });

  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch {
      // Field stays at the emptyEntry default.
    }
  });

  return entries;
}

/**
 * Cache-only by default (no live ESI call); `live: true` refreshes with
 * capped concurrency — same contract as `roster.ts`'s `loadRosterSnapshot`.
 */
export async function loadRosterAttention(opts?: {
  live?: boolean;
  now?: number;
}): Promise<AttentionEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];
  const nowMs = opts?.now ?? Date.now();
  return opts?.live ? liveAttention(characters, nowMs) : cacheOnlyAttention(characters, nowMs);
}
