/**
 * Data for a pasted Local list (issues #2863, and the intel rework that put
 * kills by space and contact standing on every row): a batched name -> id
 * lookup (`POST /universe/ids`, exact match only), every found pilot's current
 * corporation and alliance, the viewer's own contacts and affiliation, and one
 * zKillboard kill list per non-friendly pilot among the first
 * `MAX_LIST_PILOTS` names (issue #5668: the rest are placed by organization).
 *
 * Rows are reported as they settle so the table fills in while zKillboard
 * answers. zKillboard calls are made a few at a time, not all 40 at once, with
 * unknown and neutral pilots ahead of red and orange contacts.
 */
import { postUniverseIds } from '@/esi/endpoints';
import { resolveAffiliations } from '@/features/character/affiliations';
import { loadContacts } from '@/features/character/contacts';
import { resolveNames } from '@/features/character/names';
import { summarizeKills, type KillRecord, type KillSummary } from '@/engine/pilotList/killActivity';
import { isFriendly } from '@/engine/pilotList/grouping';
import { MAX_LIST_PILOTS } from '@/engine/pilotList/parsePilotPaste';
import { resolveStanding, type ContactStanding } from '@/engine/pilotList/standing';
import { needsDangerRatio, needsLossHistory } from '@/engine/pilotList/threatVerdict';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { lossTimesMs } from './pilotLossTimes';
import { killerRatio } from './zkillFigures';
import {
  classifyKillHistoryAge,
  type PilotNameId,
  type StoredExtras,
  type StoredKillHistory,
  readStoredCharacterIds,
  readStoredKillHistories,
  storeCharacterIds,
  storeKillHistory,
} from './pilotHistoryStore';
import { fetchPilotKillHistory, fetchPilotKillmails, fetchPilotStats } from '@/lib/zkillboard';

/** zKillboard is a volunteer-run service: keep the fan-out well under ESI's. */
const ZKILL_CONCURRENCY = 4;

/** Who the list is being read for: their contacts, and the corporation and alliance they are in. */
export interface ViewerContext {
  /** Contact id (a pilot, corporation or alliance) -> standing. */
  contacts: ReadonlyMap<number, number>;
  corporationId: number | null;
  allianceId: number | null;
}

export const NO_VIEWER: ViewerContext = {
  contacts: new Map(),
  corporationId: null,
  allianceId: null,
};

/**
 * The viewer's contacts and affiliation. Never throws: both only decorate the
 * list, so a missing scope or a failed request is the same as having none.
 */
export async function loadViewerContext(characterId: number | null): Promise<ViewerContext> {
  if (characterId === null) return NO_VIEWER;
  const [contacts, affiliations] = await Promise.all([
    loadContacts(characterId)
      .then((result) => result.cached?.data ?? [])
      .catch(() => []),
    resolveAffiliations([characterId]).catch(() => new Map()),
  ]);
  const own = affiliations.get(characterId);
  return {
    contacts: new Map(contacts.map((c) => [c.contact_id, c.standing])),
    corporationId: own?.corporation_id ?? null,
    allianceId: own?.alliance_id ?? null,
  };
}

export type PilotKillsState =
  | { kind: 'loading' }
  /** Not looked up: not a pilot, or in your own corporation or alliance, or a blue contact. */
  | { kind: 'skipped' }
  /** zKillboard could not be reached. */
  | { kind: 'unreachable' }
  /** Past the first `MAX_LIST_PILOTS` names: placed by organization only. */
  | { kind: 'notLookedUp' }
  | {
      kind: 'ready';
      kills: KillRecord[];
      summary: KillSummary;
      /**
       * Set while these kills come from an earlier paste, older than the fresh
       * window, and a refresh is still to land (or failed): when they were read.
       */
      staleSinceMs?: number;
    };

/**
 * What the Threat verdict needs beyond the kills, looked up only for a pilot
 * it can change the level of: the two ratios for one with enough recent kills
 * to be dangerous (`needsDangerRatio`), the dates of their newest losses for
 * one with no recent kill, who is "inactive" unless they lost a ship lately
 * (`needsLossHistory`). Most rows stay `idle`.
 */
export type PilotThreatExtras =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      dangerRatio: number | null;
      killerRatio: number | null;
      /** null when the losses were not looked up or could not be read. */
      lossTimesMs: number[] | null;
    };

export interface PilotListRow {
  /** The name as pasted: also the row's key, so it never changes while the row loads. */
  name: string;
  characterId: number | null;
  /** ESI has no pilot by exactly this name. */
  notFound: boolean;
  corporationId: number | null;
  allianceId: number | null;
  corporationName: string | null;
  allianceName: string | null;
  standing: ContactStanding | null;
  /** Set when the pilot is in the viewer's own corporation or alliance. */
  ownOrganization: 'corporation' | 'alliance' | null;
  kills: PilotKillsState;
  extras: PilotThreatExtras;
}

export interface LoadPilotListOptions {
  signal?: AbortSignal;
  /** Called with the full row list each time a row changes. */
  onRows: (rows: PilotListRow[]) => void;
  /** Resolves to the viewer's contacts and affiliation; waited on once the names are known. */
  viewer?: Promise<ViewerContext>;
}

function extrasNeeded(kills: KillRecord[], now: number): boolean {
  return needsDangerRatio(kills, now) || needsLossHistory(kills, now);
}

/** Whether stored extras hold what the verdict needs for these kills (nothing needed counts). */
function extrasCover(kills: KillRecord[], extras: StoredExtras | null, now: number): boolean {
  if (needsDangerRatio(kills, now)) return extras !== null && extras.dangerRatio !== null;
  if (needsLossHistory(kills, now)) return extras !== null && extras.lossTimesMs !== null;
  return true;
}

function isKnownBad(row: PilotListRow): boolean {
  return row.standing?.band === 'red' || row.standing?.band === 'orange';
}

export async function loadPilotList(
  names: readonly string[],
  { signal, onRows, viewer = Promise.resolve(NO_VIEWER) }: LoadPilotListOptions
): Promise<void> {
  let rows: PilotListRow[] = names.map((name, index) => ({
    name,
    characterId: null,
    notFound: false,
    corporationId: null,
    allianceId: null,
    corporationName: null,
    allianceName: null,
    standing: null,
    ownOrganization: null,
    kills: index < MAX_LIST_PILOTS ? { kind: 'loading' } : { kind: 'notLookedUp' },
    extras: { kind: 'idle' },
  }));
  onRows(rows);

  // A name answered in the last day is not asked again (issue #5812).
  const knownIds = await readStoredCharacterIds(names, Date.now()).catch(
    () => new Map<string, PilotNameId>()
  );
  const unknownNames = [...new Set(names.filter((n) => !knownIds.has(n.toLowerCase())))];
  const ids = unknownNames.length > 0 ? await postUniverseIds(unknownNames, { signal }) : {};
  const resolved = ids.characters ?? [];
  await storeCharacterIds(resolved, Date.now());
  const byName = new Map([...knownIds, ...resolved.map((c) => [c.name.toLowerCase(), c] as const)]);
  rows = rows.map((row) => {
    const hit = byName.get(row.name.toLowerCase());
    return hit === undefined
      ? { ...row, notFound: true, kills: { kind: 'skipped' } }
      : { ...row, characterId: hit.id };
  });
  if (signal?.aborted) return;
  onRows(rows);

  // A 2,000-name Local takes ~80 updates: patch one slot, not a scan of every row.
  const indexOf = new Map(rows.map((row, i) => [row.characterId, i]));
  function update(characterId: number, patch: Partial<PilotListRow>) {
    if (signal?.aborted) return;
    const i = indexOf.get(characterId);
    if (i === undefined) return;
    rows = rows.slice();
    rows[i] = { ...rows[i], ...patch };
    onRows(rows);
  }

  const characterIds = rows.flatMap((row) => (row.characterId === null ? [] : [row.characterId]));

  // Corporation and alliance, and the viewer's contacts, place a row before any
  // kill list arrives. A failure of either leaves the row as an unknown pilot.
  const [affiliations, viewerContext] = await Promise.all([
    resolveAffiliations(characterIds).catch(() => new Map()),
    viewer.catch(() => NO_VIEWER),
  ]);
  if (signal?.aborted) return;
  rows = rows.map((row) => {
    if (row.characterId === null) return row;
    const a = affiliations.get(row.characterId);
    const corporationId = a?.corporation_id ?? null;
    const allianceId = a?.alliance_id ?? null;
    const own: PilotListRow['ownOrganization'] =
      allianceId !== null && allianceId === viewerContext.allianceId
        ? 'alliance'
        : corporationId !== null && corporationId === viewerContext.corporationId
          ? 'corporation'
          : null;
    const placed: PilotListRow = {
      ...row,
      corporationId,
      allianceId,
      ownOrganization: own,
      standing: resolveStanding(viewerContext.contacts, {
        characterId: row.characterId,
        corporationId,
        allianceId,
      }),
    };
    return isFriendly(placed) ? { ...placed, kills: { kind: 'skipped' } } : placed;
  });
  onRows(rows);

  // Names are context, not the answer: a failure leaves the cells empty.
  const orgIds = [...new Set(rows.flatMap((r) => [r.corporationId, r.allianceId]))].filter(
    (id): id is number => id !== null
  );
  const orgNames = resolveNames(orgIds)
    .then((names) => {
      if (signal?.aborted) return;
      rows = rows.map((row) => ({
        ...row,
        corporationName: row.corporationId === null ? null : (names.get(row.corporationId) ?? null),
        allianceName: row.allianceId === null ? null : (names.get(row.allianceId) ?? null),
      }));
      onRows(rows);
    })
    .catch(() => undefined);

  // Kill histories come from the last paste when they are recent enough
  // (issue #5812): fresh ones are used as they are, up-to-a-day-old ones are
  // shown at once, marked stale, and asked for again behind the list.
  const lookUp = rows.flatMap((row) =>
    row.characterId !== null && row.kills.kind === 'loading' ? [row.characterId] : []
  );
  const stored = await readStoredKillHistories(lookUp).catch(
    () => new Map<number, StoredKillHistory>()
  );
  if (signal?.aborted) return;
  const readAt = Date.now();
  interface Job {
    characterId: number;
    /** 'fetch': nothing usable stored. 'refresh': stale copy shown. 'extras': fresh copy, only the verdict's extras missing. */
    mode: 'fetch' | 'refresh' | 'extras';
    /** A red or orange contact: asked about last. */
    bad: boolean;
    kills?: KillRecord[];
    /** When the stored kills were read: extras fetched for them are stored under it. */
    fetchedAt?: number;
  }
  const badIds = new Set(
    rows.flatMap((row) => (row.characterId !== null && isKnownBad(row) ? [row.characterId] : []))
  );
  const jobs: Job[] = [];
  const patches = new Map<number, Partial<PilotListRow>>();
  for (const characterId of lookUp) {
    const bad = badIds.has(characterId);
    const copy = stored.get(characterId);
    const age = copy === undefined ? 'expired' : classifyKillHistoryAge(readAt - copy.fetchedAt);
    if (copy === undefined || age === 'expired') {
      jobs.push({ characterId, mode: 'fetch', bad });
      continue;
    }
    // Stored extras that cover what the verdict needs make a fresh copy free of requests.
    const covered = extrasCover(copy.kills, copy.extras, readAt);
    const needed = extrasNeeded(copy.kills, readAt);
    if (age === 'stale') {
      jobs.push({
        characterId,
        mode: 'refresh',
        bad,
        kills: copy.kills,
        fetchedAt: copy.fetchedAt,
      });
    } else if (!covered) {
      jobs.push({ characterId, mode: 'extras', bad, kills: copy.kills, fetchedAt: copy.fetchedAt });
    }
    patches.set(characterId, {
      kills: {
        kind: 'ready',
        kills: copy.kills,
        summary: summarizeKills(copy.kills, readAt),
        ...(age === 'stale' ? { staleSinceMs: copy.fetchedAt } : {}),
      },
      extras: !needed
        ? { kind: 'idle' }
        : covered && copy.extras !== null
          ? { kind: 'ready', ...copy.extras }
          : { kind: 'loading' },
    });
  }
  if (patches.size > 0) {
    rows = rows.map((row) => {
      const patch = row.characterId === null ? undefined : patches.get(row.characterId);
      return patch === undefined ? row : { ...row, ...patch };
    });
    onRows(rows);
  }

  // The threat verdict's extra reads (ratios, loss dates) for a pilot it can change,
  // kept with the stored kills they were read for.
  async function runExtras(characterId: number, kills: KillRecord[], fetchedAt: number) {
    const now = Date.now();
    const wantsRatios = needsDangerRatio(kills, now);
    const wantsLosses = needsLossHistory(kills, now);
    if (!wantsRatios && !wantsLosses) {
      update(characterId, { extras: { kind: 'idle' } });
      return;
    }
    // The same slot reads what the verdict still needs, so a pilot never doubles the fan-out.
    let extras: StoredExtras;
    let answered: boolean;
    if (wantsRatios) {
      const stats = await fetchPilotStats(characterId).catch(() => ({
        kind: 'failed' as const,
        reason: 'offline' as const,
      }));
      answered = stats.kind === 'stats';
      extras = {
        dangerRatio: stats.kind === 'stats' ? stats.stats.dangerRatio : null,
        killerRatio: stats.kind === 'stats' ? killerRatio(stats.stats) : null,
        lossTimesMs: null,
      };
    } else {
      const killmails = await fetchPilotKillmails(characterId).catch(() => ({
        ok: false as const,
        reason: 'offline' as const,
      }));
      answered = killmails.ok;
      extras = {
        dangerRatio: null,
        killerRatio: null,
        lossTimesMs: killmails.ok ? lossTimesMs(killmails.entries) : null,
      };
    }
    update(characterId, { extras: { kind: 'ready', ...extras } });
    if (answered) await storeKillHistory(characterId, kills, fetchedAt, extras);
  }

  // Pilots with nothing usable first, then stale ones, then fresh ones that
  // only need their extras. Red and orange contacts go last within each: the
  // viewer already knows they are bad news, so the unknowns and neutrals are
  // the ones worth waiting on. Array sort is stable, so each keeps pasted order.
  const MODE_ORDER = { fetch: 0, refresh: 1, extras: 2 } as const;
  const queue = jobs.sort(
    (a, b) => Number(a.bad) - Number(b.bad) || MODE_ORDER[a.mode] - MODE_ORDER[b.mode]
  );
  await mapWithConcurrencyLimit(queue, ZKILL_CONCURRENCY, async (job) => {
    if (signal?.aborted) return;
    const { characterId } = job;
    let kills = job.kills;
    let fetchedAt = job.fetchedAt;
    if (job.mode !== 'extras') {
      const result = await fetchPilotKillHistory(characterId).catch(() => ({
        ok: false as const,
        reason: 'offline' as const,
      }));
      if (result.ok) {
        kills = result.kills;
        fetchedAt = Date.now();
        await storeKillHistory(characterId, kills, fetchedAt);
        update(characterId, {
          kills: { kind: 'ready', kills, summary: summarizeKills(kills, fetchedAt) },
          extras: extrasNeeded(kills, fetchedAt) ? { kind: 'loading' } : { kind: 'idle' },
        });
      } else if (job.mode === 'fetch') {
        update(characterId, { kills: { kind: 'unreachable' } });
        return;
      }
      // A failed refresh keeps the stale copy and its mark: never "unreachable" while a copy exists.
    }
    if (kills !== undefined && fetchedAt !== undefined && !signal?.aborted) {
      await runExtras(characterId, kills, fetchedAt);
    }
  });
  await orgNames;
}
