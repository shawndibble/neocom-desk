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

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

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
      <Button
        size="sm"
        onClick={() => setRenaming(true)}
        aria-label={`${t('skillCompare.rename')} ${comparison.name}`}
      >
        {t('skillCompare.rename')}
      </Button>
      <Button variant="danger" size="sm" onClick={() => onRequestDelete(comparison.id)}>
        {t('skillCompare.delete')}
      </Button>
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

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
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
  // The selection (+ manual-refresh generation) last fully fetched, so
  // "loading" is derived rather than a separately-set flag that could drift.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const lastRefreshNonceRef = useRef(refreshNonce);
  const [degradedNotice, setDegradedNotice] = useState(false);
  // The saved comparison Save should overwrite, if any — set on load, cleared
  // once the selection empties. Without it, repeated Saves pile up duplicates.
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  const [differingOnly, setDifferingOnly] = useState(false);
  const [groupColumnVisible, setGroupColumnVisible] = useState(true);
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
    const key = selectionKey;
    // A manual refresh forces every selected character to re-fetch (it also
    // calls invalidateFreshness()); otherwise only characters not already
    // held in skillsByCharacter need a request — reselecting one costs
    // nothing extra. lastRefreshNonceRef only advances once a run actually
    // commits (below), not here: advancing it eagerly would let a refresh
    // interrupted by a mid-flight selection change look already-handled to
    // the next run, silently downgrading it from a forced refetch to a
    // dedup-only one.
    const forceAll = refreshNonce !== lastRefreshNonceRef.current;
    const idsToFetch = idsNeedingFetch(
      selectedIds,
      new Set(skillsByCharacterRef.current.keys()),
      forceAll
    );
    if (idsToFetch.length === 0) {
      lastRefreshNonceRef.current = refreshNonce;
      setLoadedFor(key);
      return;
    }
    void loadSkillsForCharacters(idsToFetch).then((result) => {
      if (cancelled) return;
      lastRefreshNonceRef.current = refreshNonce;
      setSkillsByCharacter((prev) => new Map([...prev, ...result.skillsByCharacter]));
      setFetchedAtByCharacter((prev) => new Map([...prev, ...result.fetchedAtByCharacter]));
      setLoadedFor(key);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on selectionKey, selectedIds/refreshNonce are its inputs
  }, [selectionKey]);

  const loading = selectedIds.length > 0 && loadedFor !== selectionKey;

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
    setSelectedIds(next);
    if (next.length === 0) setActiveComparisonId(null);
  }

  function handleSave() {
    if (selectedIds.length === 0) return;
    const existing = comparisonsValue.items.find((item) => item.id === activeComparisonId);
    const comparison: SavedComparison = existing
      ? { ...existing, characterIds: selectedIds }
      : {
          id: crypto.randomUUID(),
          name: t('skillCompare.untitledName'),
          characterIds: selectedIds,
        };
    void comparisonsSetValue(upsertComparison(comparisonsValue, comparison, Date.now()));
    setActiveComparisonId(comparison.id);
  }

  function handleLoad(comparison: SavedComparison) {
    const known = new Set((characters ?? []).map((c) => c.characterId));
    const resolved = resolveComparisonCharacterIds(comparison, known);
    setDegradedNotice(resolved.length < comparison.characterIds.length);
    setSelectedIds(resolved);
    setActiveComparisonId(comparison.id);
  }

  function handleConfirmDelete() {
    if (!deletingId) return;
    void comparisonsSetValue(removeComparison(comparisonsValue, deletingId, Date.now()));
    if (activeComparisonId === deletingId) setActiveComparisonId(null);
    setDeletingId(null);
  }

  function handleRename(id: string, name: string) {
    const target = comparisonsValue.items.find((item) => item.id === id);
    if (!target) return;
    void comparisonsSetValue(upsertComparison(comparisonsValue, { ...target, name }, Date.now()));
  }

  const rows = useMemo<ComparisonRow[]>(
    () =>
      catalog ? buildComparisonRows(selectedIds, skillsByCharacter, catalog.bySkillTypeID) : [],
    [catalog, selectedIds, skillsByCharacter]
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
      ...selectedIds.map((characterId): DataTableColumn<ComparisonRow> => ({
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
    [selectedIds, nameFor, t, groupColumnVisible]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('nav.skills')}
        actions={
          <Button
            variant="primary"
            size="sm"
            disabled={selectedIds.length === 0}
            onClick={handleSave}
          >
            {t('skillCompare.saveComparison')}
          </Button>
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
            return (
              <li key={character.characterId}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCharacter(character.characterId)}
                  className={`flex items-center gap-1.5 rounded-xs border px-2 py-1 text-xs ${FOCUS_RING} ${
                    selected ? 'border-accent bg-panel-2' : 'border-line'
                  }`}
                >
                  <CharacterAvatar characterId={character.characterId} size="sm" />
                  {character.name}
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
      ) : loading || !catalog ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('skillCompare.loading')} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('skillCompare.noDataTitle')} hint={t('skillCompare.noDataHint')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.length > 1 && (
                <FilterChip
                  label={t('skillCompare.differingOnly')}
                  selected={differingOnly}
                  onToggle={() => setDifferingOnly((value) => !value)}
                />
              )}
              <FilterChip
                label={t('skillCompare.groupColumnToggle')}
                selected={groupColumnVisible}
                onToggle={() => setGroupColumnVisible((value) => !value)}
              />
            </div>
            <div className="flex items-center gap-2">
              {oldestFetchedAt && <DataAgeBadge date={oldestFetchedAt} />}
              <IconButton
                icon={<Icon.Refresh />}
                label={t('skillCompare.refresh')}
                onClick={() => {
                  // loadCorrectedSkills reads the skill queue through the
                  // windowed path (issue #41); a manual refresh here must
                  // bypass it the same way useRouteSnapshot's refresh does.
                  invalidateFreshness();
                  setRefreshNonce((n) => n + 1);
                }}
              />
            </div>
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
          <EmptyState title={t('skillCompare.savedEmpty')} className="py-6" />
        ) : (
          <ul className="rounded-xs border border-line">
            {comparisonsValue.items.map((comparison) => (
              <SavedComparisonRow
                key={comparison.id}
                comparison={comparison}
                onLoad={handleLoad}
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
