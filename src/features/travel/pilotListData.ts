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

const ZKILL_CONCURRENCY = 4;

export interface ViewerContext {
  contacts: ReadonlyMap<number, number>;
  corporationId: number | null;
  allianceId: number | null;
}

export const NO_VIEWER: ViewerContext = {
  contacts: new Map(),
  corporationId: null,
  allianceId: null,
};

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
  | { kind: 'skipped' }
  | { kind: 'unreachable' }
  | { kind: 'notLookedUp' }
  | {
      kind: 'ready';
      kills: KillRecord[];
      summary: KillSummary;
      staleSinceMs?: number;
    };

export type PilotThreatExtras =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      dangerRatio: number | null;
      killerRatio: number | null;
      lossTimesMs: number[] | null;
    };

export interface PilotListRow {
  name: string;
  characterId: number | null;
  notFound: boolean;
  corporationId: number | null;
  allianceId: number | null;
  corporationName: string | null;
  allianceName: string | null;
  standing: ContactStanding | null;
  ownOrganization: 'corporation' | 'alliance' | null;
  kills: PilotKillsState;
  extras: PilotThreatExtras;
}

export interface LoadPilotListOptions {
  signal?: AbortSignal;
  onRows: (rows: PilotListRow[]) => void;
  viewer?: Promise<ViewerContext>;
}

function extrasNeeded(kills: KillRecord[], now: number): boolean {
  return needsDangerRatio(kills, now) || needsLossHistory(kills, now);
}

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
    mode: 'fetch' | 'refresh' | 'extras';
    bad: boolean;
    kills?: KillRecord[];
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

  async function runExtras(characterId: number, kills: KillRecord[], fetchedAt: number) {
    const now = Date.now();
    const wantsRatios = needsDangerRatio(kills, now);
    const wantsLosses = needsLossHistory(kills, now);
    if (!wantsRatios && !wantsLosses) {
      update(characterId, { extras: { kind: 'idle' } });
      return;
    }
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
    }
    if (kills !== undefined && fetchedAt !== undefined && !signal?.aborted) {
      await runExtras(characterId, kills, fetchedAt);
    }
  });
  await orgNames;
}
