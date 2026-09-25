/**
 * `/corp/members` — who is in this corporation, and are they still here.
 *
 * The one question no other view in the app can answer. Every other page is
 * about what a Character owns; this one is about people, and about the people
 * who have stopped showing up in particular — which is why the table opens
 * sorted by the longest silence rather than alphabetically.
 *
 * **Director-only, and the whole page rather than a panel.** `membertracking`
 * declares `Director` in ESI's `x-required-roles` and nothing else, so
 * `canReadMembers` maps to that one role (`engine/corpRoles.ts`) and an
 * Accountant gets nothing useful here at all. `/corp` degrades panel by panel
 * because its panels answer to four different roles; this page has exactly one
 * gate, so it hides whole (CONTEXT.md round 35) rather than rendering a shell
 * over a permission no login can grant.
 *
 * The `unknown` / `ready` asymmetry and the mount-on-`ready` split are
 * `useCorpRouteGate`'s, shared with `/corp` and `/corp/assets` — see that hook.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpSubNav } from '@/features/corp/CorpSubNav';
import {
  CorpRosterColumnPicker,
  CorpRosterStats,
  CorpRosterSummary,
  CorpRosterTable,
  type RosterRow,
} from '@/features/corp/CorpRoster';
import { MemberContextMenu } from '@/features/corp/MemberContextMenu';
import { membersCsvColumns } from '@/features/corp/membersCsv';
import { loadCorporationId } from '@/features/corp/boardData';
import {
  EMPTY_MEMBER_LABELS,
  loadCorporationMemberIds,
  loadCorporationMemberTracking,
  loadMemberLabels,
  toMemberActivity,
  type MemberLabels,
} from '@/features/corp/members';
import { readPreviousRoster, recordRoster } from '@/features/corp/rosterState';
import {
  EMPTY_ROSTER_DIFF,
  diffRoster,
  filterRosterRows,
  label,
  memberStanding,
  type MemberActivity,
  type RosterDiff,
} from '@/engine/corp/members';
import { downloadCsv } from '@/lib/downloadCsv';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, optionalIdParam, textParam } from '@/lib/urlState';

/** Same debounce shape as `CorpAssets.tsx`/`Assets.tsx`: the input stays responsive, only the filter waits. */
const SEARCH_DEBOUNCE_MS = 250;

/** The roster's filters, in the URL (ADR 0015); the table's sort is `CorpRosterTable`'s `?sort=`. */
const FILTER_PARAMS = {
  q: textParam(),
  dark: boolParam(),
  ship: optionalIdParam(),
  loc: optionalIdParam(),
};

/** The funnel's share of the filters — everything but the search box, which acts immediately. */
interface RosterFilter {
  dark: boolean;
  ship: number | null;
  loc: number | null;
}

/** "Any" sentinel for the ship/location selects: Radix reads `''` as "nothing selected". */
const ANY = '__any';

interface RosterOption {
  id: number;
  label: string;
}

/**
 * The distinct ids one field takes across the roster, labelled the way the
 * table prints them. Built from the whole roster, not the filtered rows, so
 * picking a ship does not empty the location list of every other choice.
 */
function rosterOptions(
  rows: readonly RosterRow[],
  pick: (row: RosterRow) => { id: number | null; name: string | null }
): RosterOption[] {
  const byId = new Map<number, string>();
  for (const row of rows) {
    const { id, name } = pick(row);
    if (id !== null && !byId.has(id)) byId.set(id, label(name, id));
  }
  return [...byId]
    .map(([id, text]) => ({ id, label: text }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

interface MembersSnapshot {
  corporationId: number | null;
  members: MemberActivity[];
  labels: MemberLabels;
  diff: RosterDiff;
  /** Oldest `fetchedAt` across the two reads — the badge speaks for the whole view. */
  fetchedAt: Date | null;
  /** Captured in the loader: `Date.now()` in render is impure. */
  loadedAt: number;
}

const EMPTY_SNAPSHOT: MembersSnapshot = {
  corporationId: null,
  members: [],
  labels: EMPTY_MEMBER_LABELS,
  diff: EMPTY_ROSTER_DIFF,
  fetchedAt: null,
  loadedAt: 0,
};

async function loadMembersSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<MembersSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  const loadedAt = Date.now();
  // No corporation id means no corp-scoped cache key to read under; inventing
  // one would file rows as `corp:undefined:` (#293).
  if (corporationId === null || signal.cancelled) {
    return { ...EMPTY_SNAPSHOT, corporationId, loadedAt };
  }

  const [roster, tracking] = await Promise.all([
    loadCorporationMemberIds(characterId, corporationId),
    loadCorporationMemberTracking(characterId, corporationId),
  ]);

  const memberIds = roster.cached?.data ?? null;
  // The baseline is read *and* replaced in the same pass, so the summary
  // reports each change exactly once. Two things must not consume it:
  //
  // - A roster we could not read at all. Overwriting the baseline with nothing
  //   would silently swallow every change made since the last successful read.
  // - A run whose result is about to be thrown away. `useRouteSnapshot`
  //   discards a stale response, but a write already made is not discarded with
  //   it — a cancelled run would consume the change and the user would never see
  //   the summary. Skipping the write is the safe direction: the next run diffs
  //   against the older baseline and reports the change again.
  let diff = EMPTY_ROSTER_DIFF;
  if (memberIds !== null) {
    diff = diffRoster(await readPreviousRoster(characterId, corporationId), memberIds);
    if (!signal.cancelled) await recordRoster(characterId, corporationId, memberIds, loadedAt);
  }

  const members = toMemberActivity(tracking.cached?.data ?? []);
  // Members who left are in neither read any more, so their names are asked for
  // explicitly — the summary is the only place they appear.
  const labels = await loadMemberLabels(characterId, members, diff.left);

  const fetchedAts = [roster, tracking]
    .map((result) => result.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  const fetchedAt =
    fetchedAts.length === 0
      ? null
      : fetchedAts.reduce((oldest, date) => (date < oldest ? date : oldest));

  return { corporationId, members, labels, diff, fetchedAt, loadedAt };
}

/** Mounted only once Corp Access is `ready` — see the `/corp` loader note. */
function CorpMembersView() {
  const { t } = useTranslation();
  // The corp's own inactivity policy. Feeds `memberStanding` here so the
  // table's tone, the stat strip's count and the dark-only filter all narrow
  // to the same set — the invariant the engine's single constant used to hold.
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const hydrateDarkThreshold = useDarkThreshold((state) => state.hydrate);
  useEffect(() => {
    void hydrateDarkThreshold();
  }, [hydrateDarkThreshold]);
  const snapshot = useRouteSnapshot<MembersSnapshot>(loadMembersSnapshot, undefined, {
    // Keeps the roster on screen during a manual refresh (issue #418).
    staleWhileRevalidate: true,
    cacheKey: 'corp-members',
  });
  const data = snapshot.data;

  const rows = useMemo<RosterRow[]>(() => {
    if (data === null) return [];
    return data.members.map((member) => ({
      characterId: member.characterId,
      name: data.labels.characters.get(member.characterId) ?? null,
      standing: memberStanding(member, data.loadedAt, darkAfterDays),
      shipTypeId: member.shipTypeId,
      shipName:
        member.shipTypeId === null ? null : (data.labels.ships.get(member.shipTypeId) ?? null),
      locationId: member.locationId,
      locationName:
        member.locationId === null ? null : (data.labels.locations.get(member.locationId) ?? null),
      startMs: member.startMs,
    }));
  }, [data, darkAfterDays]);

  // Search + dark-only/ship/location filters (issue #421, AC2/AC3):
  // AND-composed, same stacking rule as Mail's search-and-label filters
  // (CONTEXT.md round 55). The stat strip's dark count stays computed from the
  // full roster — only the table narrows.
  // All in the URL (ADR 0015); the dark *threshold* is a synced setting and
  // stays out of it.
  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const search = filterParams.q;
  const darkOnly = filterParams.dark;
  const { ship, loc } = filterParams;
  const rosterFilter = useMemo<RosterFilter>(
    () => ({ dark: darkOnly, ship, loc }),
    [darkOnly, ship, loc]
  );
  const activeFilterCount = (darkOnly ? 1 : 0) + (ship !== null ? 1 : 0) + (loc !== null ? 1 : 0);
  const shipOptions = useMemo(
    () => rosterOptions(rows, (row) => ({ id: row.shipTypeId, name: row.shipName })),
    [rows]
  );
  const locationOptions = useMemo(
    () => rosterOptions(rows, (row) => ({ id: row.locationId, name: row.locationName })),
    [rows]
  );
  const darkCount = rows.filter((row) => row.standing.isDark).length;
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);
  const visibleRows = useMemo(
    () =>
      filterRosterRows(rows, debouncedSearch).filter(
        (row) =>
          (!darkOnly || row.standing.isDark) &&
          (ship === null || row.shipTypeId === ship) &&
          (loc === null || row.locationId === loc)
      ),
    [rows, debouncedSearch, darkOnly, ship, loc]
  );

  // Row context menu (issue #421, AC1): the shared Public Info Modal is the
  // one entry point, same as every other list with a Show Info action.
  function memberRowContextMenu(row: RosterRow, tr: ReactElement) {
    return (
      <MemberContextMenu characterId={row.characterId} name={label(row.name, row.characterId)}>
        {tr}
      </MemberContextMenu>
    );
  }

  if (!snapshot.hydrated) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('corp.members.title')}
        meta={
          data?.fetchedAt ? (
            <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('corp.members.refresh')}
            onClick={snapshot.refresh}
            disabled={snapshot.loading}
          />
        }
      />
      <CorpSubNav />

      {snapshot.loading && data === null ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          <FilterBar
            value={rosterFilter}
            onChange={(next) => setFilterParams(next)}
            activeCount={activeFilterCount}
            search={
              <SearchInput
                value={search}
                onChange={(e) => setFilterParams({ q: e.target.value })}
                placeholder={t('corp.members.searchPlaceholder')}
                className="min-w-48 flex-1"
              />
            }
            actions={<CorpRosterColumnPicker />}
          >
            {(draft, setDraft) => (
              <>
                <FilterChip
                  label={t('corp.members.dark', { days: darkAfterDays })}
                  count={darkCount}
                  selected={draft.dark}
                  onToggle={() => setDraft({ ...draft, dark: !draft.dark })}
                  tooltip={t('corp.members.darkHint', { days: darkAfterDays })}
                />
                <FilterField label={t('corp.members.shipFilterLabel')}>
                  <Select
                    value={draft.ship === null ? ANY : String(draft.ship)}
                    onValueChange={(value) =>
                      setDraft({ ...draft, ship: value === ANY ? null : Number(value) })
                    }
                  >
                    <SelectTrigger aria-label={t('corp.members.shipFilterLabel')} className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>{t('corp.members.shipFilterAll')}</SelectItem>
                      {shipOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
                <FilterField label={t('corp.members.locationFilterLabel')}>
                  <Select
                    value={draft.loc === null ? ANY : String(draft.loc)}
                    onValueChange={(value) =>
                      setDraft({ ...draft, loc: value === ANY ? null : Number(value) })
                    }
                  >
                    <SelectTrigger
                      aria-label={t('corp.members.locationFilterLabel')}
                      className="w-56"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>{t('corp.members.locationFilterAll')}</SelectItem>
                      {locationOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
              </>
            )}
          </FilterBar>
          <Panel padded={false}>
            <div className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CorpRosterStats rows={rows} />
                <IconButton
                  size="sm"
                  icon={<Icon.Download />}
                  label={t('corp.members.exportCsv')}
                  disabled={visibleRows.length === 0}
                  onClick={() => downloadCsv('corp-members', visibleRows, membersCsvColumns(t))}
                />
              </div>
              <CorpRosterSummary
                diff={data?.diff ?? EMPTY_ROSTER_DIFF}
                names={data?.labels.characters ?? EMPTY_MEMBER_LABELS.characters}
              />
            </div>
            {rows.length > 0 && visibleRows.length === 0 ? (
              // The roster has members; the search/filters hid them all. The
              // table's own empty state says EVE sent nothing, which would be wrong here.
              <EmptyState
                title={t('corp.members.noFilterMatches')}
                hint={t('corp.members.noFilterMatchesHint')}
                className="py-8"
                action={
                  <Button
                    size="sm"
                    onClick={() => setFilterParams({ q: '', dark: false, ship: null, loc: null })}
                  >
                    {t('corp.members.resetFilters')}
                  </Button>
                }
              />
            ) : (
              <CorpRosterTable rows={visibleRows} rowContextMenu={memberRowContextMenu} />
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

export function CorpMembers() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadMembers);

  if (gate.status === 'loading') return <Spinner />;

  if (gate.status === 'denied') {
    return (
      <div className="space-y-4">
        <PageHeader title={t('corp.members.title')} />
        <EmptyState title={t('corp.members.noAccessTitle')} hint={t('corp.members.noAccessHint')} />
      </div>
    );
  }

  return <CorpMembersView />;
}
