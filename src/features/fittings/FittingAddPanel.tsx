import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, NativeSelect, SearchInput, TypeIcon } from '@/components/ui';
import { Back } from '@/components/ui/icons';
import {
  groupsHoldingRack,
  searchCandidates,
  type CandidateRack,
} from '@/engine/fittings/candidates';
import { targetRack, type AddTarget } from './addTarget';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { checkCandidates, type CandidateCheck } from './dogmaFittingEngine';
import type { FittingCatalogue } from './useFittingCatalogue';

interface FittingAddPanelProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  target: AddTarget | null;
  /** Ship data (dogma engine) loaded — slot and fit checks can run. */
  engineReady: boolean;
  profile: PilotProfile | null;
  /** Whether an item of this rack has somewhere to go right now. */
  canPlace: (rack: CandidateRack) => boolean;
  onAdd: (typeId: number, rack: CandidateRack) => void;
  /** Desktop shows the market-group browser; the phone sheet is search only. */
  showGroups: boolean;
}

function descendantGroupIds(root: number, catalogue: FittingCatalogue): Set<number> {
  const ids = new Set<number>([root]);
  const stack = [root];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of catalogue.childrenByParent.get(id) ?? []) {
      ids.add(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

/**
 * The Fitting editor's Add panel (issue #1533): a market-group item browser
 * with search and filter chips. Search, the market groups and the meta
 * filter are static data and work at once; "fits this hull", "can fly" and
 * Add itself need the ship data, and say so until it has loaded.
 */
export function FittingAddPanel({
  fitting,
  catalogue,
  target,
  engineReady,
  profile,
  canPlace,
  onAdd,
  showGroups,
}: FittingAddPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [fitsSlot, setFitsSlot] = useState(true);
  const [fitsHull, setFitsHull] = useState(true);
  const [canFlyOnly, setCanFlyOnly] = useState(false);
  const [metaGroupId, setMetaGroupId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);

  const rack = target !== null && fitsSlot ? targetRack(target) : null;
  const checksReady = engineReady && profile !== null;

  const visibleGroups = useMemo(
    () =>
      catalogue === null
        ? new Set<number>()
        : groupsHoldingRack(catalogue.marketTypes, rack, catalogue.rackOf, catalogue.parentOf),
    [catalogue, rack]
  );

  const metaGroups = useMemo(
    () =>
      catalogue === null
        ? []
        : Object.entries(catalogue.variations.metaGroups)
            .map(([id, name]) => ({ id: Number(id), name }))
            .sort((a, b) => a.id - b.id),
    [catalogue]
  );

  const results = useMemo(() => {
    if (catalogue === null) return [];
    const groupIds = groupId === null ? null : descendantGroupIds(groupId, catalogue);
    const found = searchCandidates(catalogue.marketTypes, {
      query,
      rack,
      rackOf: catalogue.rackOf,
      groupIds,
      metaGroupId,
      metaGroupOf: (typeId) => catalogue.variations.types[typeId]?.metaGroupId ?? null,
    });
    if (!checksReady) return found.map((entry) => ({ entry, check: null }));

    const idsByRack = new Map<CandidateRack, number[]>();
    for (const entry of found) {
      const entryRack = catalogue.rackOf[String(entry.typeId)];
      idsByRack.set(entryRack, [...(idsByRack.get(entryRack) ?? []), entry.typeId]);
    }
    const checks = new Map<number, CandidateCheck>();
    for (const [entryRack, ids] of idsByRack)
      for (const [id, check] of checkCandidates(fitting.shipTypeId, entryRack, ids, profile))
        checks.set(id, check);
    return found
      .map((entry) => ({ entry, check: checks.get(entry.typeId) ?? null }))
      .filter(({ check }) => (!fitsHull || check?.fitsHull) && (!canFlyOnly || check?.canFly));
  }, [
    catalogue,
    groupId,
    query,
    rack,
    metaGroupId,
    checksReady,
    fitting.shipTypeId,
    profile,
    fitsHull,
    canFlyOnly,
  ]);

  const currentGroup = groupId === null ? null : (catalogue?.groupsById.get(groupId) ?? null);
  const childGroups = (catalogue?.childrenByParent.get(groupId) ?? []).filter((group) =>
    visibleGroups.has(group.id)
  );

  return (
    <div className="space-y-2">
      <SearchInput
        aria-label={t('fittings.add.searchLabel')}
        placeholder={t('fittings.add.searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip
          label={t('fittings.add.fitsSlot')}
          selected={fitsSlot && target !== null}
          disabled={target === null}
          tooltip={t('fittings.add.fitsSlotTooltip')}
          onToggle={() => setFitsSlot((on) => !on)}
        />
        <FilterChip
          label={t('fittings.add.fitsHull')}
          selected={fitsHull && checksReady}
          disabled={!checksReady}
          tooltip={t('fittings.add.fitsHullTooltip')}
          onToggle={() => setFitsHull((on) => !on)}
        />
        <FilterChip
          label={t('fittings.add.canFly')}
          selected={canFlyOnly && checksReady}
          disabled={!checksReady}
          tooltip={t('fittings.add.canFlyTooltip')}
          onToggle={() => setCanFlyOnly((on) => !on)}
        />
        <NativeSelect
          size="sm"
          aria-label={t('fittings.add.metaLabel')}
          value={metaGroupId ?? ''}
          onChange={(event) =>
            setMetaGroupId(event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">{t('fittings.add.metaAny')}</option>
          {metaGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {!engineReady && (
        <p className="text-xs text-warning">{t('fittings.add.waitingForShipData')}</p>
      )}

      {showGroups && catalogue !== null && (
        <div className="space-y-1">
          {currentGroup && (
            <Button
              size="sm"
              align="start"
              className="w-full"
              onClick={() => setGroupId(currentGroup.parentId)}
            >
              <Back aria-hidden />
              {currentGroup.name}
            </Button>
          )}
          <div className="flex flex-wrap gap-1">
            {childGroups.map((group) => (
              <Button key={group.id} size="sm" onClick={() => setGroupId(group.id)}>
                {group.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {catalogue === null ? (
        <p className="text-xs text-text-dim">{t('fittings.add.loadingCatalogue')}</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.add.noResults')}</p>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {results.map(({ entry, check }) => {
            const entryRack = catalogue.rackOf[String(entry.typeId)];
            const placeable = engineReady && canPlace(entryRack);
            return (
              <li key={entry.typeId}>
                <Button
                  align="start"
                  className="w-full"
                  disabled={!placeable}
                  onClick={() => onAdd(entry.typeId, entryRack)}
                >
                  <TypeIcon typeId={entry.typeId} size={32} width={24} height={24} />
                  <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                  {check !== null && !check.canFly && (
                    <span className="shrink-0 text-xs text-warning">
                      {t('fittings.add.missingSkills')}
                    </span>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
