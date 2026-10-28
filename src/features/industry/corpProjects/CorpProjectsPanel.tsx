/**
 * The Corp projects view of the Build panel (issue #4786): open manufacture
 * projects of each selected Character's corporation, as a buyer with a fixed
 * reward. Each row is priced by the Build Plan "Add to Compare" would save
 * (`planForCorpProject`, resolved by `useComparedBuildResults`), so what a row
 * promises is what Compare shows. Desktop is a table whose rows open to the
 * working; a phone gets the Opportunities-style cards.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  DataTable,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import { remainingUnits } from '@/engine/corpProjects/corpProjects';
import {
  NO_CHARACTER_MODIFIERS,
  type CharacterModifiers,
} from '@/engine/industry/characterModifiers';
import { detectOwnedStock } from '@/engine/industry/ownedStock';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import { formatIskCompact } from '@/lib/isk';
import { useIsDesktop } from '@/lib/useIsDesktop';
import type { BlueprintCatalog } from '../blueprintCatalog';
import type { BuildPlanPricingInputs } from '../buildPlanPricingInputs';
import type { ActivityFacilityDefaults } from '../facilityDefaults';
import type { OwnedStockSnapshot } from '../ownedStockDetection';
import { useComparedBuildResults, type ComparedBuildRow } from '../useComparedBuildResults';
import { BlueprintSourceCell, EndsIn, ProfitCell, ProjectWorking } from './CorpProjectCells';
import { CorpProjectCards } from './CorpProjectCards';
import {
  buildCorpProjectRow,
  buildableEntry,
  corpProjectPlanId,
  corpProjectRowId,
  ownedBlueprintFor,
  planForCorpProject,
  type CorpProjectRow,
} from './corpProjectRows';
import type { CharacterCorpProjects } from './useCorpProjects';

interface CorpProjectsPanelProps {
  /** Desktop's plain title; unset on a phone, where `leading`'s view picker stands in for it. */
  title?: string;
  leading?: ReactNode;
  meta: ReactNode;
  entries: readonly CharacterCorpProjects[];
  loading: boolean;
  catalog: BlueprintCatalog;
  pi: PiData | null;
  pricingInputs: BuildPlanPricingInputs;
  facilityDefaults: ActivityFacilityDefaults;
  assumedMe: number;
  ownedStockSnapshot: OwnedStockSnapshot;
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  characterNames: ReadonlyMap<number, string>;
  hubFor: (characterId: number) => TradeHub;
  modifiersByCharacter: ReadonlyMap<number, CharacterModifiers>;
  /** Saves the picked rows' plans and opens Build Plan Compare with them. */
  onAddToCompare: (plans: readonly BuildPlanRecord[]) => void;
}

/** One Character's plans, priced through the same resolution a Build Plan page runs. */
function CharacterPricing({
  characterId,
  plans,
  catalog,
  pi,
  ownedBlueprints,
  modifiers,
  pricingInputs,
  onPriced,
}: {
  characterId: number;
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  pricingInputs: BuildPlanPricingInputs;
  onPriced: (characterId: number, rows: readonly ComparedBuildRow[]) => void;
}) {
  const rows = useComparedBuildResults({
    plans,
    catalog,
    pi,
    ownedBlueprints,
    modifiers,
    pricingInputs,
  });
  useEffect(() => onPriced(characterId, rows), [characterId, rows, onPriced]);
  return null;
}

const NO_BLUEPRINTS: readonly CharacterBlueprint[] = [];

export function CorpProjectsPanel({
  title,
  leading,
  meta,
  entries,
  loading,
  catalog,
  pi,
  pricingInputs,
  facilityDefaults,
  assumedMe,
  ownedStockSnapshot,
  ownedByCharacter,
  characterNames,
  hubFor,
  modifiersByCharacter,
  onAddToCompare,
}: CorpProjectsPanelProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const [now] = useState(() => new Date());

  // Whole-account stock of every material a listed project's blueprint needs.
  const stock = useMemo(() => {
    const typeIds = new Set<number>();
    for (const { projects } of entries) {
      for (const project of projects) {
        const entry = catalog.byProductTypeID.get(project.typeId);
        for (const m of entry?.blueprint.materials ?? []) typeIds.add(m.typeID);
      }
    }
    return detectOwnedStock(ownedStockSnapshot.sources, typeIds);
  }, [entries, catalog, ownedStockSnapshot]);

  // One plan per project the Character can still be paid for. Ids are stable so
  // a re-render that rebuilds them does not restart pricing.
  const planned = useMemo(
    () =>
      entries.flatMap(({ characterId, projects }) =>
        projects.flatMap((project) => {
          const entry = buildableEntry(project, catalog);
          if (!entry) return [];
          const units = remainingUnits(project);
          const owned = ownedBlueprintFor(
            ownedByCharacter.get(characterId) ?? NO_BLUEPRINTS,
            entry.blueprintTypeID
          );
          const plan = {
            ...planForCorpProject({
              entry,
              owned,
              characterId,
              hub: hubFor(characterId),
              facilityDefaults,
              assumedMe,
              stock,
              units,
            }),
            id: corpProjectPlanId(characterId, project.id, units),
            updatedAt: 0,
          };
          return [{ characterId, project, entry, owned, plan }];
        })
      ),
    [entries, catalog, ownedByCharacter, hubFor, facilityDefaults, assumedMe, stock]
  );

  const plansByCharacter = useMemo(() => {
    const map = new Map<number, BuildPlanRecord[]>();
    for (const { characterId, plan } of planned) {
      const list = map.get(characterId);
      if (list) list.push(plan);
      else map.set(characterId, [plan]);
    }
    return map;
  }, [planned]);

  const [priced, setPriced] = useState<ReadonlyMap<number, readonly ComparedBuildRow[]>>(new Map());
  const onPriced = useCallback((characterId: number, rows: readonly ComparedBuildRow[]) => {
    setPriced((prev) => new Map(prev).set(characterId, rows));
  }, []);

  const rows = useMemo(
    () =>
      planned.map(({ characterId, project, entry, owned, plan }) => {
        const compared = priced.get(characterId)?.find((r) => r.planId === plan.id);
        return buildCorpProjectRow({
          project,
          characterId,
          characterName: characterNames.get(characterId) ?? '',
          entry,
          owned,
          compared: compared ?? { loading: true, result: null, error: null },
          now,
        });
      }),
    [planned, priced, characterNames, now]
  );
  const planByRowId = useMemo(
    () =>
      new Map(
        planned.map(({ characterId, project, plan }) => [
          corpProjectRowId(characterId, project.id),
          plan,
        ])
      ),
    [planned]
  );

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedPlans = rows
    .filter((row) => selectedIds.has(row.id))
    .flatMap((row) => planByRowId.get(row.id) ?? []);
  const showCharacter = entries.length > 1;

  const columns: DataTableColumn<CorpProjectRow>[] = [
    {
      id: 'select',
      header: t('industry.corpProjects.select'),
      phoneHidden: true,
      render: (row) => (
        // The label is the 36px touch target on a coarse pointer, and keeps the click off the row's disclosure.
        <label className={touchCheckboxLabelClassName} onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selectedIds.has(row.id)}
            onChange={() => toggleSelected(row.id)}
            aria-label={t('industry.opportunitiesSelectFor', { name: row.itemName })}
          />
        </label>
      ),
    },
    {
      id: 'project',
      header: t('industry.corpProjects.project'),
      primary: true,
      sortValue: (row) => row.itemName,
      render: (row) => (
        <span className="block min-w-0">
          <span className="block font-medium text-text">{row.itemName}</span>
          <span className="block text-xs text-text-dim">
            {t('industry.corpProjects.unitsAndReward', {
              units: row.remaining,
              reward: formatIskCompact(row.project.rewardEach),
            })}
            {showCharacter && ` · ${row.characterName}`}
          </span>
        </span>
      ),
    },
    {
      id: 'blueprint',
      header: t('industry.corpProjects.blueprint'),
      render: (row) => <BlueprintSourceCell row={row} />,
    },
    {
      id: 'profit',
      header: t('industry.corpProjects.profitAtCap'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.profit ?? undefined,
      render: (row) => <ProfitCell row={row} />,
    },
    {
      id: 'ends',
      header: t('industry.corpProjects.endsIn'),
      align: 'right',
      className: 'tabular-nums',
      sortFirst: 'asc',
      sortValue: (row) => row.hoursLeft ?? undefined,
      render: (row) => <EndsIn hours={row.hoursLeft} />,
    },
  ];

  return (
    <Panel
      title={title}
      leading={leading}
      meta={meta}
      wrapMeta
      padded={false}
      actions={
        selectedPlans.length > 1 ? (
          <IconButton
            size="sm"
            icon={<Icon.Compare />}
            label={t('industry.opportunitiesAddToCompare', { count: selectedPlans.length })}
            onClick={() => onAddToCompare(selectedPlans)}
          />
        ) : undefined
      }
    >
      {[...plansByCharacter].map(([characterId, plans]) => (
        <CharacterPricing
          key={characterId}
          characterId={characterId}
          plans={plans}
          catalog={catalog}
          pi={pi}
          ownedBlueprints={ownedByCharacter.get(characterId) ?? NO_BLUEPRINTS}
          modifiers={modifiersByCharacter.get(characterId) ?? NO_CHARACTER_MODIFIERS}
          pricingInputs={pricingInputs}
          onPriced={onPriced}
        />
      ))}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('industry.corpProjects.emptyTitle')}
          hint={t('industry.corpProjects.emptyHint')}
          className="py-8"
        />
      ) : isDesktop ? (
        <DataTable
          label={t('industry.corpProjects.tableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          defaultSort={{ columnId: 'profit', direction: 'desc' }}
          expandableRow={{
            leadingIcon: true,
            renderDetail: (row) => <ProjectWorking row={row} />,
          }}
        />
      ) : (
        <CorpProjectCards
          rows={[...rows].sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity))}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          showCharacter={showCharacter}
        />
      )}
    </Panel>
  );
}
