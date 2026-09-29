import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Button,
  CharacterAvatar,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterChip,
  IconButton,
  Modal,
  PageHeader,
  Spinner,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { controlHeightClassName, toggleChipStateClassName } from '@/components/ui/controlStyles';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import {
  buildComparisonRows,
  hasDifferingLevels,
  idsNeedingFetch,
  type ComparisonRow,
} from '@/features/skills/compareSkills';
import {
  removeComparison,
  resolveComparisonCharacterIds,
  upsertComparison,
  useSkillComparisons,
  type SavedComparison,
} from '@/features/skills/comparisons';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { invalidateFreshness } from '@/esi/cache';
import type { TrainedSkill } from '@/engine/types';
import { useUrlParams } from '@/lib/useUrlState';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { skillCompareCsvColumns } from '@/features/skills/skillCompareCsv';
import { boolParam, idListParam, nullableTextParam } from '@/lib/urlState';

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Short-lived view state (ADR 0015): the selection, its saved-comparison link, and the two display toggles. One group — several of these change together in a single click (see `toggleCharacter`, `handleLoad`). */
const SKILL_COMPARE_PARAMS = {
  ids: idListParam(),
  comparisonId: nullableTextParam(),
  differingOnly: boolParam(),
  groupColumn: boolParam(true),
};

interface SkillsSnapshot {
  skillsByCharacter: Map<number, ReadonlyMap<number, TrainedSkill>>;
  fetchedAtByCharacter: Map<number, Date>;
}

/**
 * Each requested character's queue-corrected trained-skill map, fetched with
 * the same bounded fan-out `roster.ts` uses — a request settles on its own,
 * so one character's failure just leaves it out of the result. Callers pass
 * only the ids actually needing a fetch (`idsNeedingFetch`) and merge the
 * result into whatever is already cached for the rest of the selection.
 */
async function loadSkillsForCharacters(characterIds: readonly number[]): Promise<SkillsSnapshot> {
  const skillsByCharacter = new Map<number, ReadonlyMap<number, TrainedSkill>>();
  const fetchedAtByCharacter = new Map<number, Date>();
  const requests = characterIds.map((characterId) => async () => {
    const corrected = await loadCorrectedSkills(characterId, Date.now());
    skillsByCharacter.set(characterId, corrected.trained);
    if (corrected.fetchedAt) fetchedAtByCharacter.set(characterId, corrected.fetchedAt);
  });
  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch {
      // Leave the character out of the map — it contributes no rows.
    }
  });
  return { skillsByCharacter, fetchedAtByCharacter };
}

interface SavedComparisonRowProps {
  comparison: SavedComparison;
  onLoad: (comparison: SavedComparison) => void;
  onRequestDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function SavedComparisonRow({
  comparison,
  onLoad,
  onRequestDelete,
  onRename,
}: SavedComparisonRowProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(comparison.name);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== comparison.name) onRename(comparison.id, name);
    else setDraftName(comparison.name);
  }

  return (
    <li className="flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0">
      {renaming ? (
        <TextInput
          size="sm"
          autoFocus
          value={draftName}
          aria-label={t('skillCompare.rename')}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraftName(comparison.name);
              setRenaming(false);
            }
          }}
          className="flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => onLoad(comparison)}
          onDoubleClick={() => setRenaming(true)}
          className={`flex-1 truncate text-left ${FOCUS_RING}`}
        >
          {comparison.name}
        </button>
      )}
      <IconButton
        size="sm"
        icon={<Icon.Rename />}
        label={`${t('skillCompare.rename')} ${comparison.name}`}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={`${t('skillCompare.delete')} ${comparison.name}`}
        tone="danger"
        onClick={() => onRequestDelete(comparison.id)}
      />
    </li>
  );
}

/** Side-by-side comparison of several characters' trained skills, with saved comparisons. */
export function SkillCompare() {
  const { t } = useTranslation();
  const characters = useLiveQuery(() => db.characters.toArray());
  const comparisonsHydrate = useSkillComparisons((state) => state.hydrate);
  const comparisonsValue = useSkillComparisons((state) => state.value);
  const comparisonsSetValue = useSkillComparisons((state) => state.setValue);

  useEffect(() => {
    void comparisonsHydrate();
  }, [comparisonsHydrate]);

  const [compareParams, setCompareParams] = useUrlParams(SKILL_COMPARE_PARAMS);
  const selectedIds = compareParams.ids;
  const activeComparisonId = compareParams.comparisonId;
  const differingOnly = compareParams.differingOnly;
  const groupColumnVisible = compareParams.groupColumn;
  // A hand-edited or stale `?ids=` can name a character this device has never
  // heard of — no roster button to toggle it off, no name to show in its
  // column. Prune once the roster is known, the same "resolve against a known
  // set" a saved comparison already gets (`resolveComparisonCharacterIds`).
  // Gated on `characters !== undefined`: pruning against the still-empty
  // first render would evict every id before the roster has even loaded.
  useEffect(() => {
    if (characters === undefined) return;
    const known = new Set(characters.map((c) => c.characterId));
    const pruned = selectedIds.filter((id) => known.has(id));
    if (pruned.length !== selectedIds.length) setCompareParams({ ids: pruned });
  }, [characters, selectedIds, setCompareParams]);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [skillsByCharacter, setSkillsByCharacter] = useState<
    Map<number, ReadonlyMap<number, TrainedSkill>>
  >(new Map());
  const [fetchedAtByCharacter, setFetchedAtByCharacter] = useState<Map<number, Date>>(new Map());
  // Read inside the fetch effect instead of `skillsByCharacter` directly, so
  // the effect can stay keyed on `selectionKey` alone — adding the map itself
  // as a dependency would re-run it the instant that same effect updates it.
  const skillsByCharacterRef = useRef(skillsByCharacter);
  useEffect(() => {
    skillsByCharacterRef.current = skillsByCharacter;
  });
  // Characters whose fetch has settled at least once. Only these get a
  // column: one still waiting on its first fetch would otherwise read as a
  // column of zeros — "has not trained this", a confident false answer
  // (DESIGN §6a). A refresh keeps them settled, so their current levels stay
  // on screen until the new data replaces them. A failed fetch settles too
  // and still contributes zeros, as before — surfacing per-character
  // failures is its own gap, not this loading contract's.
  const [settledIds, setSettledIds] = useState<ReadonlySet<number>>(new Set());
  const [refreshNonce, setRefreshNonce] = useState(0);
  // The refresh generation last committed; `refreshNonce` ahead of it means a
  // manual refresh is still in flight.
  const [committedRefreshNonce, setCommittedRefreshNonce] = useState(refreshNonce);
  const [degradedNotice, setDegradedNotice] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void loadSkillCatalog().then(setCatalog);
  }, []);

  const selectionKey = `${selectedIds.join(',')}:${refreshNonce}`;

  useEffect(() => {
    // Nothing to fetch: `rows` below is `[]` for an empty selection regardless
    // of stale data left in `skillsByCharacter` from a prior selection.
    if (selectedIds.length === 0) return;
    let cancelled = false;
    // A manual refresh forces every selected character to re-fetch (it also
    // calls invalidateFreshness()); otherwise only characters not already
    // held in skillsByCharacter need a request — reselecting one costs
    // nothing extra. committedRefreshNonce only advances once a run actually
    // commits (below), not here: advancing it eagerly would let a refresh
    // interrupted by a mid-flight selection change look already-handled to
    // the next run, silently downgrading it from a forced refetch to a
    // dedup-only one.
    const forceAll = refreshNonce !== committedRefreshNonce;
    const idsToFetch = idsNeedingFetch(
      selectedIds,
      new Set(skillsByCharacterRef.current.keys()),
      forceAll
    );
    if (idsToFetch.length === 0) {
      setCommittedRefreshNonce(refreshNonce);
      return;
    }
    void loadSkillsForCharacters(idsToFetch).then((result) => {
      if (cancelled) return;
      setCommittedRefreshNonce(refreshNonce);
      setSkillsByCharacter((prev) => new Map([...prev, ...result.skillsByCharacter]));
      setFetchedAtByCharacter((prev) => new Map([...prev, ...result.fetchedAtByCharacter]));
      setSettledIds((prev) => new Set([...prev, ...idsToFetch]));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on selectionKey, selectedIds/refreshNonce are its inputs
  }, [selectionKey]);

  // The selection minus anyone still waiting on a first fetch: the columns
  // actually drawn, and what "Differing only" compares across.
  const loadedIds = useMemo(
    () => selectedIds.filter((id) => settledIds.has(id)),
    [selectedIds, settledIds]
  );
  const pendingIds = useMemo(
    () => new Set(selectedIds.filter((id) => !settledIds.has(id))),
    [selectedIds, settledIds]
  );
  const refreshing = refreshNonce !== committedRefreshNonce;

  const oldestFetchedAt = useMemo(() => {
    let oldest: Date | null = null;
    for (const characterId of selectedIds) {
      const fetchedAt = fetchedAtByCharacter.get(characterId);
      if (fetchedAt && (!oldest || fetchedAt < oldest)) oldest = fetchedAt;
    }
    return oldest;
  }, [selectedIds, fetchedAtByCharacter]);

  function toggleCharacter(characterId: number) {
    setDegradedNotice(false);
    const next = selectedIds.includes(characterId)
      ? selectedIds.filter((id) => id !== characterId)
      : [...selectedIds, characterId];
    setCompareParams(next.length === 0 ? { ids: next, comparisonId: null } : { ids: next });
  }

  function handleSave() {
    if (selectedIds.length === 0) return;
    const existing = comparisonsValue.items.find((item) => item.id === activeComparisonId);
    const comparison: SavedComparison = existing
      ? { ...existing, characterIds: [...selectedIds] }
      : {
          id: crypto.randomUUID(),
          name: t('skillCompare.untitledName'),
          characterIds: [...selectedIds],
        };
    void comparisonsSetValue(upsertComparison(comparisonsValue, comparison, Date.now()));
    setCompareParams({ comparisonId: comparison.id });
  }

  /**
   * A saved comparison is clickable on the very first frame — the list renders
   * straight out of the comparisons store — while `characters` arrives from a
   * `useLiveQuery` a tick or more later. Resolving against a roster that has
   * not loaded yet drops every id, which left an empty selection under a false
   * "some characters were removed" notice that nothing re-ran once the roster
   * did arrive (#594). So read the roster directly for that one early click.
   *
   * Awaiting it can't clobber a hand-picked selection: the character buttons
   * render from that same `characters`, so there are none to press until it
   * has resolved.
   */
  async function handleLoad(comparison: SavedComparison) {
    const roster = characters ?? (await db.characters.toArray());
    const known = new Set(roster.map((c) => c.characterId));
    const resolved = resolveComparisonCharacterIds(comparison, known);
    setDegradedNotice(resolved.length < comparison.characterIds.length);
    setCompareParams({ ids: resolved, comparisonId: comparison.id });
  }

  function handleConfirmDelete() {
    if (!deletingId) return;
    void comparisonsSetValue(removeComparison(comparisonsValue, deletingId, Date.now()));
    if (activeComparisonId === deletingId) setCompareParams({ comparisonId: null });
    setDeletingId(null);
  }

  function handleRename(id: string, name: string) {
    const target = comparisonsValue.items.find((item) => item.id === id);
    if (!target) return;
    void comparisonsSetValue(upsertComparison(comparisonsValue, { ...target, name }, Date.now()));
  }

  const rows = useMemo<ComparisonRow[]>(
    () => (catalog ? buildComparisonRows(loadedIds, skillsByCharacter, catalog.bySkillTypeID) : []),
    [catalog, loadedIds, skillsByCharacter]
  );

  const visibleRows = useMemo(
    () => (differingOnly ? rows.filter(hasDifferingLevels) : rows),
    [rows, differingOnly]
  );

  const nameFor = useMemo(() => {
    const byId = new Map((characters ?? []).map((c) => [c.characterId, c.name]));
    return (characterId: number) => byId.get(characterId) ?? `#${characterId}`;
  }, [characters]);

  const columns = useMemo<DataTableColumn<ComparisonRow>[]>(
    () => [
      {
        id: 'skill',
        header: t('skillCompare.skillColumn'),
        sortValue: (row) => row.name,
        render: (row) => row.name,
      },
      ...(groupColumnVisible
        ? [
            {
              id: 'group',
              header: t('skillCompare.groupColumn'),
              className: 'text-text-dim',
              sortValue: (row) => row.groupName,
              render: (row) => row.groupName,
            } satisfies DataTableColumn<ComparisonRow>,
          ]
        : []),
      ...loadedIds.map((characterId): DataTableColumn<ComparisonRow> => ({
        id: `character-${characterId}`,
        header: nameFor(characterId),
        align: 'right',
        sortValue: (row) => row.levels.get(characterId) ?? 0,
        // Dims a character trailing the group's best level, so the reader
        // who is ahead is legible without reading every number.
        cellClassName: (row) =>
          (row.levels.get(characterId) ?? 0) < row.maxLevel
            ? 'text-text-dim'
            : 'font-semibold text-accent',
        render: (row) => row.levels.get(characterId) ?? 0,
      })),
    ],
    [loadedIds, nameFor, t, groupColumnVisible]
  );
  const csvColumns = useMemo(
    () => skillCompareCsvColumns(t, loadedIds, nameFor),
    [t, loadedIds, nameFor]
  );
  const compareExport = useTableExport({
    surface: 'skill-compare',
    rows: visibleRows,
    columns: csvColumns,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('nav.skills')}
        meta={oldestFetchedAt && <DataAgeBadge date={oldestFetchedAt} />}
        actions={
          <>
            {selectedIds.length > 0 && (
              <IconButton
                icon={<Icon.Refresh />}
                label={t('skillCompare.refresh')}
                disabled={refreshing}
                onClick={() => {
                  // loadCorrectedSkills reads the skill queue through the
                  // windowed path (issue #41); a manual refresh here must
                  // bypass it the same way useRouteSnapshot's refresh does.
                  invalidateFreshness();
                  setRefreshNonce((n) => n + 1);
                }}
              />
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={handleSave}
            >
              {t('skillCompare.saveComparison')}
            </Button>
          </>
        }
      />
      <SkillsSubNav />

      <div>
        <h2 className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('skillCompare.pickCharacters')}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {(characters ?? []).map((character) => {
            const selected = selectedIds.includes(character.characterId);
            const pending = pendingIds.has(character.characterId);
            return (
              <li key={character.characterId}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCharacter(character.characterId)}
                  className={`flex items-center gap-1.5 rounded-xs border px-2.5 text-xs ${controlHeightClassName.sm} ${FOCUS_RING} ${toggleChipStateClassName(selected)}`}
                >
                  <CharacterAvatar characterId={character.characterId} size="sm" />
                  {character.name}
                  {pending && (
                    <Spinner
                      size="sm"
                      label={t('skillCompare.characterLoading', { name: character.name })}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {degradedNotice && (
        <p className="text-[0.6875rem] text-warning uppercase">{t('skillCompare.someRemoved')}</p>
      )}

      {selectedIds.length === 0 ? (
        <EmptyState
          title={t('skillCompare.noneSelectedTitle')}
          hint={t('skillCompare.noneSelectedHint')}
        />
      ) : !catalog || (rows.length === 0 && pendingIds.size > 0) ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('skillCompare.loading')} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('skillCompare.noDataTitle')} hint={t('skillCompare.noDataHint')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {loadedIds.length > 1 && (
              <FilterChip
                label={t('skillCompare.differingOnly')}
                selected={differingOnly}
                onToggle={() => setCompareParams({ differingOnly: !differingOnly })}
              />
            )}
            <FilterChip
              label={t('skillCompare.groupColumnToggle')}
              selected={groupColumnVisible}
              onToggle={() => setCompareParams({ groupColumn: !groupColumnVisible })}
            />
            <span className="ml-auto">
              <TableActionsMenu
                name={t('skillCompare.tableLabel')}
                tableExport={compareExport}
                size="md"
              />
            </span>
          </div>
          {visibleRows.length === 0 ? (
            <EmptyState
              title={t('skillCompare.noDataTitle')}
              hint={t('skillCompare.differingOnlyEmptyHint')}
            />
          ) : (
            // Below `sm`, DataTable's default 'stack' layout turns each skill
            // into its own card with a character/level line per row — real
            // reading beats the horizontal scroll a matrix would otherwise
            // force on a phone. `overflow-x-auto` still covers wider widths,
            // where several compared characters can outgrow the viewport as
            // real columns.
            <div className="overflow-x-auto">
              <DataTable
                {...compareExport.tableProps}
                columns={columns}
                rows={visibleRows}
                rowKey={(row) => row.skillTypeID}
                label={t('skillCompare.tableLabel')}
                defaultSort={{ columnId: 'skill', direction: 'asc' }}
              />
            </div>
          )}
        </>
      )}

      <div>
        <h2 className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('skillCompare.savedTitle')}
        </h2>
        {comparisonsValue.items.length === 0 ? (
          <EmptyState
            title={t('skillCompare.savedEmpty')}
            hint={t('skillCompare.savedEmptyHint')}
            className="py-6"
          />
        ) : (
          <ul className="rounded-xs border border-line">
            {comparisonsValue.items.map((comparison) => (
              <SavedComparisonRow
                key={comparison.id}
                comparison={comparison}
                onLoad={(loaded) => void handleLoad(loaded)}
                onRequestDelete={setDeletingId}
                onRename={handleRename}
              />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
        title={t('skillCompare.delete')}
      >
        <p className="text-xs text-text-dim">{t('skillCompare.deleteConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingId(null)}>
            {t('skillCompare.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
            {t('skillCompare.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
