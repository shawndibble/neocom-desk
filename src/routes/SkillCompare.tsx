import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Button,
  CharacterAvatar,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  Spinner,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';
import { buildComparisonRows, type ComparisonRow } from '@/features/skills/compareSkills';
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
  /** Oldest of the compared characters' fetch times — the DataAgeBadge speaks for the whole table. */
  oldestFetchedAt: Date | null;
}

/**
 * Each character's queue-corrected trained-skill map, fetched with the same
 * bounded fan-out `roster.ts` uses — a request settles on its own, so one
 * character's failure just leaves it out of the comparison.
 */
async function loadSkillsForCharacters(characterIds: readonly number[]): Promise<SkillsSnapshot> {
  const skillsByCharacter = new Map<number, ReadonlyMap<number, TrainedSkill>>();
  let oldestFetchedAt: Date | null = null;
  const requests = characterIds.map((characterId) => async () => {
    const corrected = await loadCorrectedSkills(characterId, Date.now());
    skillsByCharacter.set(characterId, corrected.trained);
    if (corrected.fetchedAt && (!oldestFetchedAt || corrected.fetchedAt < oldestFetchedAt)) {
      oldestFetchedAt = corrected.fetchedAt;
    }
  });
  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch {
      // Leave the character out of the map — it contributes no rows.
    }
  });
  return { skillsByCharacter, oldestFetchedAt };
}

interface SavedComparisonRowProps {
  comparison: SavedComparison;
  onLoad: (comparison: SavedComparison) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function SavedComparisonRow({ comparison, onLoad, onDelete, onRename }: SavedComparisonRowProps) {
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
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          if (window.confirm(t('skillCompare.deleteConfirm'))) onDelete(comparison.id);
        }}
      >
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
  const [oldestFetchedAt, setOldestFetchedAt] = useState<Date | null>(null);
  // The selection (+ manual-refresh generation) last fully fetched, so
  // "loading" is derived rather than a separately-set flag that could drift.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [degradedNotice, setDegradedNotice] = useState(false);
  // The saved comparison Save should overwrite, if any — set on load, cleared
  // once the selection empties. Without it, repeated Saves pile up duplicates.
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);

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
    void loadSkillsForCharacters(selectedIds).then((result) => {
      if (cancelled) return;
      setSkillsByCharacter(result.skillsByCharacter);
      setOldestFetchedAt(result.oldestFetchedAt);
      setLoadedFor(key);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on selectionKey, selectedIds is its input
  }, [selectionKey]);

  const loading = selectedIds.length > 0 && loadedFor !== selectionKey;

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

  function handleDelete(id: string) {
    void comparisonsSetValue(removeComparison(comparisonsValue, id, Date.now()));
    if (activeComparisonId === id) setActiveComparisonId(null);
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
      {
        id: 'group',
        header: t('skillCompare.groupColumn'),
        className: 'text-text-dim',
        sortValue: (row) => row.groupName,
        render: (row) => row.groupName,
      },
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
    [selectedIds, nameFor, t]
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
          <div className="flex items-center justify-end gap-2">
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
          {/*
            The one table that keeps its columns on a phone. Comparing is the
            page: a stacked card per skill would put each character's level on
            its own line, which reads fine for one skill and makes scanning
            "who is ahead" across skills impossible. A matrix earns its
            sideways scroll, so this opts out of the responsive collapse and
            keeps the wrapper below.
          */}
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.skillTypeID}
              label={t('skillCompare.tableLabel')}
              defaultSort={{ columnId: 'skill', direction: 'asc' }}
              responsive="table"
            />
          </div>
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
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
