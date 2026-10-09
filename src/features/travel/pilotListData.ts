/**
 * Data for a pasted Local list (issues #2863, and the intel rework that put
 * kills by space and contact standing on every row): one batch name -> id
 * lookup (`POST /universe/ids`, exact match only), each found pilot's current
 * corporation and alliance, the viewer's own contacts and affiliation, and one
 * zKillboard kill list per pilot who is not already friendly.
 *
 * Rows are reported as they settle so the table fills in while zKillboard
 * answers. zKillboard calls are made a few at a time, not all 40 at once.
 */
import { postUniverseIds } from '@/esi/endpoints';
import { resolveAffiliations } from '@/features/character/affiliations';
import { loadContacts } from '@/features/character/contacts';
import { resolveNames } from '@/features/character/names';
import { summarizeKills, type KillRecord, type KillSummary } from '@/engine/pilotList/killActivity';
import { resolveStanding, type ContactStanding } from '@/engine/pilotList/standing';
import { needsDangerRatio } from '@/engine/pilotList/threatVerdict';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { fetchPilotKillHistory, fetchPilotStats } from '@/lib/zkillboard';

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
  | { kind: 'ready'; kills: KillRecord[]; summary: KillSummary };

/**
 * The one number the Threat verdict needs beyond the kills: zKillboard's
 * all-time danger ratio. Only a pilot with enough recent kills to be dangerous
 * has it looked up (`needsDangerRatio`), so most rows stay `idle`.
 */
export type PilotDangerState =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; ratio: number | null };

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
  danger: PilotDangerState;
}

export interface LoadPilotListOptions {
  signal?: AbortSignal;
  /** Called with the full row list each time a row changes. */
  onRows: (rows: PilotListRow[]) => void;
  /** Resolves to the viewer's contacts and affiliation; waited on once the names are known. */
  viewer?: Promise<ViewerContext>;
}

function isFriendly(row: PilotListRow): boolean {
  return row.ownOrganization !== null || row.standing?.band === 'blue';
}

export async function loadPilotList(
  names: readonly string[],
  { signal, onRows, viewer = Promise.resolve(NO_VIEWER) }: LoadPilotListOptions
): Promise<void> {
  let rows: PilotListRow[] = names.map((name) => ({
    name,
    characterId: null,
    notFound: false,
    corporationId: null,
    allianceId: null,
    corporationName: null,
    allianceName: null,
    standing: null,
    ownOrganization: null,
    kills: { kind: 'loading' },
    danger: { kind: 'idle' },
  }));
  onRows(rows);

  const ids = await postUniverseIds([...names], { signal });
  const byName = new Map((ids.characters ?? []).map((c) => [c.name.toLowerCase(), c]));
  rows = rows.map((row) => {
    const hit = byName.get(row.name.toLowerCase());
    return hit === undefined
      ? { ...row, notFound: true, kills: { kind: 'skipped' } }
      : { ...row, characterId: hit.id };
  });
  if (signal?.aborted) return;
  onRows(rows);

  function update(characterId: number, patch: Partial<PilotListRow>) {
    if (signal?.aborted) return;
    rows = rows.map((row) => (row.characterId === characterId ? { ...row, ...patch } : row));
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

  const toLookUp = rows.flatMap((row) =>
    row.characterId !== null && row.kills.kind === 'loading' ? [row.characterId] : []
  );
  await mapWithConcurrencyLimit(toLookUp, ZKILL_CONCURRENCY, async (characterId) => {
    if (signal?.aborted) return;
    const result = await fetchPilotKillHistory(characterId).catch(() => ({ ok: false as const }));
    const now = Date.now();
    const wantsRatio = result.ok && needsDangerRatio(result.kills, now);
    update(characterId, {
      kills: result.ok
        ? { kind: 'ready', kills: result.kills, summary: summarizeKills(result.kills, now) }
        : { kind: 'unreachable' },
      danger: wantsRatio ? { kind: 'loading' } : { kind: 'idle' },
    });
    if (!wantsRatio) return;
    // The same slot reads the stats, so a busy pilot never doubles the fan-out.
    const stats = await fetchPilotStats(characterId).catch(() => ({ kind: 'failed' as const }));
    update(characterId, {
      danger: { kind: 'ready', ratio: stats.kind === 'stats' ? stats.stats.dangerRatio : null },
    });
  });
  await orgNames;
}
