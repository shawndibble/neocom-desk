/**
 * Data for a pasted Local list (issue #2863): one batch name -> id lookup
 * (`POST /universe/ids`, exact match only), then each found pilot's
 * zKillboard stats and current corporation/alliance.
 *
 * Rows are reported as they settle so the table fills in while zKillboard
 * answers. zKillboard calls are made a few at a time, not all 40 at once.
 */
import { postUniverseIds } from '@/esi/endpoints';
import { resolveAffiliations } from '@/features/character/affiliations';
import { resolveNames } from '@/features/character/names';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { fetchPilotStats, type PilotStats } from '@/lib/zkillboard';

/** zKillboard is a volunteer-run service: keep the fan-out well under ESI's. */
const ZKILL_CONCURRENCY = 4;

export type PilotListRowState =
  | { kind: 'loading' }
  /** ESI has no pilot by exactly this name. */
  | { kind: 'not-found' }
  /** zKillboard has no kill or loss for them. */
  | { kind: 'no-history' }
  /** zKillboard could not be reached. */
  | { kind: 'unreachable' }
  | { kind: 'stats'; stats: PilotStats };

export interface PilotListRow {
  /** The name as pasted: also the row's key, so it never changes while the row loads. */
  name: string;
  characterId: number | null;
  corporationName: string | null;
  allianceName: string | null;
  state: PilotListRowState;
}

export interface LoadPilotListOptions {
  signal?: AbortSignal;
  /** Called with the full row list each time a row changes. */
  onRows: (rows: PilotListRow[]) => void;
}

export async function loadPilotList(
  names: readonly string[],
  { signal, onRows }: LoadPilotListOptions
): Promise<void> {
  let rows: PilotListRow[] = names.map((name) => ({
    name,
    characterId: null,
    corporationName: null,
    allianceName: null,
    state: { kind: 'loading' },
  }));
  onRows(rows);

  const ids = await postUniverseIds([...names], { signal });
  const byName = new Map((ids.characters ?? []).map((c) => [c.name.toLowerCase(), c]));
  rows = rows.map((row) => {
    const hit = byName.get(row.name.toLowerCase());
    return hit === undefined
      ? { ...row, state: { kind: 'not-found' } }
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
  // Corporation and alliance are context, not the answer: a failure leaves the cells empty.
  const affiliation = resolveAffiliations(characterIds)
    .then(async (map) => {
      const orgIds = [...map.values()].flatMap((a) =>
        a.alliance_id === undefined ? [a.corporation_id] : [a.corporation_id, a.alliance_id]
      );
      const orgNames = await resolveNames(orgIds);
      for (const [id, a] of map) {
        update(id, {
          corporationName: orgNames.get(a.corporation_id) ?? null,
          allianceName: a.alliance_id === undefined ? null : (orgNames.get(a.alliance_id) ?? null),
        });
      }
    })
    .catch(() => undefined);

  await mapWithConcurrencyLimit(characterIds, ZKILL_CONCURRENCY, async (characterId) => {
    if (signal?.aborted) return;
    const result = await fetchPilotStats(characterId).catch(() => ({ kind: 'failed' as const }));
    update(characterId, {
      state:
        result.kind === 'stats'
          ? { kind: 'stats', stats: result.stats }
          : { kind: result.kind === 'failed' ? 'unreachable' : 'no-history' },
    });
  });
  await affiliation;
}
