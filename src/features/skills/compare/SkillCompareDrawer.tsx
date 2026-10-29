import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  CharacterAvatar,
  DataAgeBadge,
  EmptyState,
  FilterChip,
  IconButton,
  LiveStatus,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SlideOver,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  controlHeightClassName,
  focusRingClassName,
  interactiveClassName,
  toggleChipStateClassName,
} from '@/components/ui/controlStyles';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, idListParam, nullableTextParam, optionalIdParam } from '@/lib/urlState';
import {
  buildComparisonRows,
  resolveBaseline,
  splitDiffering,
} from '@/engine/skills/compareSkills';
import { skillCompareCsvColumns } from '../skillCompareCsv';
import { useCompareSkills } from '../useCompareSkills';
import { SavedComparisonsMenu } from './SavedComparisonsMenu';
import { SkillCompareView } from './SkillCompareView';

/** Short-lived view state (ADR 0015): the selection, its saved-comparison link, the baseline and the one display toggle. One group — several of these change together in a single click. */
const SKILL_COMPARE_PARAMS = {
  ids: idListParam(),
  comparisonId: nullableTextParam(),
  baseline: optionalIdParam(),
  differingOnly: boolParam(true),
};

interface SkillCompareDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Seeds the selection when the drawer opens with none: you are the baseline you compare others against. */
  activeCharacterId: number | null;
}

/**
 * The skill comparison, opened over Skills › Trained: a right slide-over on
 * desktop, a full-height bottom sheet on a phone. Pick characters, set one as
 * the baseline, and read how each stands against it skill by skill.
 */
export function SkillCompareDrawer({ open, onClose, activeCharacterId }: SkillCompareDrawerProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const roster = useLiveQuery(() => db.characters.toArray());
  const [params, setParams] = useUrlParams(SKILL_COMPARE_PARAMS);
  const selectedIds = params.ids;
  const [someRemoved, setSomeRemoved] = useState(false);

  // Opened with nothing picked: start from the character you are looking at.
  // Once per opening — a pilot who then clears the selection means it.
  const seeded = useRef(false);
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current) return;
    if (selectedIds.length > 0) {
      seeded.current = true;
      return;
    }
    // No active character yet: wait for it rather than spend the one seed.
    if (activeCharacterId === null) return;
    seeded.current = true;
    setParams({ ids: [activeCharacterId] });
  }, [open, selectedIds.length, activeCharacterId, setParams]);

  // A hand-edited or stale `?ids=` can name a character this device has never
  // heard of — no chip to toggle it off, no name to show in its column. Prune
  // once the roster is known. Gated on `roster !== undefined`: pruning against
  // the still-empty first render would evict every id before it has loaded.
  useEffect(() => {
    if (roster === undefined) return;
    const known = new Set(roster.map((c) => c.characterId));
    const pruned = selectedIds.filter((id) => known.has(id));
    if (pruned.length !== selectedIds.length) setParams({ ids: pruned });
  }, [roster, selectedIds, setParams]);

  const compare = useCompareSkills(selectedIds, open);
  const { catalog, skillsByCharacter, loadedIds, pendingIds, failedIds } = compare;
  // A character whose skills could not be read has nothing to measure against
  // or to show: it is neither a column nor a possible baseline.
  const usableIds = useMemo(
    () => selectedIds.filter((id) => !failedIds.has(id)),
    [selectedIds, failedIds]
  );
  const baselineId = resolveBaseline(usableIds, params.baseline, activeCharacterId);
  // Until the baseline's skills land every delta would read against nothing.
  const baselinePending = baselineId !== null && pendingIds.has(baselineId);

  const nameFor = useMemo(() => {
    const byId = new Map((roster ?? []).map((c) => [c.characterId, c.name]));
    return (characterId: number) => byId.get(characterId) ?? `#${characterId}`;
  }, [roster]);

  // The baseline leads, so every other column reads as its distance from the first.
  const columns = useMemo(() => {
    const ordered =
      baselineId !== null && loadedIds.includes(baselineId)
        ? [baselineId, ...loadedIds.filter((id) => id !== baselineId)]
        : [...loadedIds];
    return ordered.map((characterId) => ({ characterId, name: nameFor(characterId) }));
  }, [loadedIds, baselineId, nameFor]);

  const allRows = useMemo(
    () => (catalog ? buildComparisonRows(loadedIds, skillsByCharacter, catalog.bySkillTypeID) : []),
    [catalog, loadedIds, skillsByCharacter]
  );
  const comparing = loadedIds.length > 1;
  const split = useMemo(
    () =>
      comparing && params.differingOnly
        ? splitDiffering(allRows)
        : { differing: allRows, identical: [] },
    [allRows, comparing, params.differingOnly]
  );

  const csvColumns = useMemo(
    () =>
      skillCompareCsvColumns(
        t,
        columns.map((c) => c.characterId),
        nameFor
      ),
    [t, columns, nameFor]
  );
  const compareExport = useTableExport({
    surface: 'skill-compare',
    rows: split.differing,
    columns: csvColumns,
  });

  // The selection lives in the URL, which a render or two behind a click: two
  // quick toggles would each read the same stale list and the second would
  // undo the first. `latestIds` holds what the last toggle wrote until the URL catches up.
  const latestIds = useRef(selectedIds);
  useEffect(() => {
    latestIds.current = selectedIds;
  }, [selectedIds]);

  function toggleCharacter(characterId: number) {
    setSomeRemoved(false);
    const current = latestIds.current;
    const next = current.includes(characterId)
      ? current.filter((id) => id !== characterId)
      : [...current, characterId];
    latestIds.current = next;
    setParams(next.length === 0 ? { ids: next, comparisonId: null } : { ids: next });
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <SavedComparisonsMenu
        selectedIds={selectedIds}
        activeComparisonId={params.comparisonId}
        roster={roster}
        onApply={(ids, comparisonId, removed) => {
          setSomeRemoved(removed);
          latestIds.current = ids;
          setParams({ ids, comparisonId, baseline: null });
        }}
        onSaved={(comparisonId) => setParams({ comparisonId })}
        onUnlinked={() => setParams({ comparisonId: null })}
      />
      {comparing && (
        <TableActionsMenu
          name={t('skillCompare.tableLabel')}
          tableExport={compareExport}
          size="md"
        />
      )}
      {selectedIds.length > 0 && (
        <IconButton
          icon={<Icon.Refresh />}
          label={t('skillCompare.refresh')}
          disabled={compare.refreshing}
          onClick={compare.refresh}
        />
      )}
      {compare.oldestFetchedAt && (
        <span className="ml-auto">
          <DataAgeBadge date={compare.oldestFetchedAt} />
        </span>
      )}
    </div>
  );

  const failedNames = [...failedIds].map(nameFor).join(', ');
  // Closing forgets the selection: it would otherwise linger in the Trained
  // URL, shared with it and reopening the drawer on a reload.
  function handleClose() {
    latestIds.current = [];
    setSomeRemoved(false);
    setParams({ ids: [], comparisonId: null, baseline: null });
    onClose();
  }

  const content = (
    <div className="space-y-3 p-3">
      {toolbar}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="sr-only">{t('skillCompare.pickCharacters')}</h3>
        <ul className="flex flex-wrap gap-2" aria-label={t('skillCompare.pickCharacters')}>
          {(roster ?? []).map((character) => {
            const selected = selectedIds.includes(character.characterId);
            return (
              <li key={character.characterId}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCharacter(character.characterId)}
                  className={cx(
                    'flex items-center gap-1.5 rounded-xs border px-2.5 text-xs',
                    controlHeightClassName.sm,
                    interactiveClassName,
                    focusRingClassName,
                    toggleChipStateClassName(selected)
                  )}
                >
                  <CharacterAvatar characterId={character.characterId} size="sm" />
                  {character.name}
                  {pendingIds.has(character.characterId) && (
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

      {usableIds.length > 1 && baselineId !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(baselineId)}
            onValueChange={(value) => setParams({ baseline: Number(value) })}
          >
            <SelectTrigger
              size="sm"
              aria-label={t('skillCompare.baseline')}
              className="w-auto min-w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {usableIds.map((id) => (
                <SelectItem key={id} value={String(id)}>
                  {t('skillCompare.baseline')}: {nameFor(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {comparing && (
            <FilterChip
              label={t('skillCompare.differingOnly')}
              selected={params.differingOnly}
              onToggle={() => setParams({ differingOnly: !params.differingOnly })}
            />
          )}
        </div>
      )}

      {someRemoved && (
        <p className="text-[0.6875rem] text-warning uppercase">{t('skillCompare.someRemoved')}</p>
      )}
      {failedIds.size > 0 && (
        <p className="text-[0.6875rem] text-warning uppercase">
          {t('skillCompare.loadFailed', { names: failedNames })}
        </p>
      )}
      <LiveStatus>{someRemoved ? t('skillCompare.someRemoved') : null}</LiveStatus>

      {selectedIds.length === 0 ? (
        <EmptyState
          title={t('skillCompare.noneSelectedTitle')}
          hint={t('skillCompare.noneSelectedHint')}
        />
      ) : !catalog || baselinePending || (pendingIds.size > 0 && loadedIds.length < 2) ? (
        <Spinner block="page" label={t('skillCompare.loading')} />
      ) : allRows.length === 0 || (split.differing.length === 0 && split.identical.length === 0) ? (
        <EmptyState title={t('skillCompare.noDataTitle')} hint={t('skillCompare.noDataHint')} />
      ) : loadedIds.length === 1 ? (
        <EmptyState
          title={t('skillCompare.onlyBaselineTitle')}
          hint={t('skillCompare.onlyBaselineHint', { name: nameFor(loadedIds[0] ?? 0) })}
        />
      ) : (
        <div className="-mx-3">
          <SkillCompareView
            characters={columns}
            baselineId={baselineId}
            rows={split.differing}
            identicalRows={split.identical}
            phone={isPhone}
          />
          {split.differing.length === 0 && (
            <p className="px-3 pt-3 text-xs text-text-dim">
              {t('skillCompare.differingOnlyEmptyHint')}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (isPhone) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        placement="sheet-full"
        title={t('skillCompare.title')}
      >
        {content}
      </Modal>
    );
  }
  return (
    <SlideOver
      open={open}
      onClose={handleClose}
      title={t('skillCompare.title')}
      flush
      maxWidthClassName="max-w-3xl"
    >
      {content}
    </SlideOver>
  );
}
