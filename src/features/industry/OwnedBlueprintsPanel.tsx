import { COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IskAmount,
  Panel,
  SearchInput,
  SegmentedControl,
  Spinner,
  type ActiveFilter,
  type DataTableColumn,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CharacterAsset, CharacterBlueprint } from '@/esi/endpoints';
import { useRowStartPlan } from './rowStartPlan';
import { iskToneClass } from '@/features/character/format';
import { loadBlueprintLocation } from '@/features/bpcContracts/blueprintLocation';
import { createColumnVisibilitySetting, useColumnVisibility } from '@/lib/columnVisibility';
import { boolParam, enumParam, textParam } from '@/lib/urlState';
import { useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { useIsDesktop } from '@/lib/useIsDesktop';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { useCorpOwnedBlueprints } from './corpOwnedBlueprints';
import { numericCell } from './format';
import {
  OPPORTUNITIES_ACTIVITY_KEY,
  OPPORTUNITIES_ACTIVITY_PARAM,
  OWNED_DEFAULT_SORT,
  OWNED_SORT_KEY,
} from './opportunitiesUrl';
import { activityFilterOptions } from './opportunityMetrics';
import type { OpportunityPlanSeed, OpportunityRow } from './opportunities';
import {
  OWNED_BLUEPRINT_SORT_VALUE,
  buildOwnedBlueprintRows,
  ownedBlueprintOwnerKey,
  filterOwnedBlueprints,
  ownedBlueprintQuantity,
  resolveBlueprintPlacement,
  type BlueprintPlacement,
  type OwnedBlueprintRow,
} from './ownedBlueprints';
import { ownedBlueprintsCsvColumns } from './ownedBlueprintsCsv';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { StartPlanButton } from './StartPlanButton';
import { MobileOwnedBlueprintList } from './MobileOwnedBlueprintList';
import { TableScroll } from '@/components/ui/TableScroll';

const OWNED_BLUEPRINTS_COLUMN_IDS = [
  'kind',
  'me',
  'te',
  'runs',
  'quantity',
  'location',
  'owner',
  'iskPerHour',
] as const;
type OwnedBlueprintsColumnId = (typeof OWNED_BLUEPRINTS_COLUMN_IDS)[number];

const useVisibleOwnedBlueprintsColumns = createColumnVisibilitySetting({
  key: 'ownedBlueprintsVisibleColumns',
  ids: OWNED_BLUEPRINTS_COLUMN_IDS,
});

const KIND_PARAM = enumParam(['all', 'bpo', 'bpc'] as const, 'all');
const SEARCH_PARAM = textParam();
const CORP_PARAM = boolParam(false);
const ownedRowKey = (row: OwnedBlueprintRow) => row.id;

const NO_ASSETS: ReadonlyMap<number, CharacterAsset> = new Map();
const NO_BLUEPRINTS: readonly CharacterBlueprint[] = [];
const NO_ISK: ReadonlyMap<string, number | null> = new Map();

const locationKey = (characterId: number, locationId: number) => `${characterId}:${locationId}`;

interface OwnedBlueprintsPanelProps {
  catalog: BlueprintCatalog;
  activeCharacterId: number;
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  characterNames: ReadonlyMap<number, string>;
  rankedRows: readonly OpportunityRow[];
  ownedStockSnapshot: OwnedStockSnapshot;
  loading: boolean;
  title?: string;
  leading?: ReactNode;
  meta: ReactNode;
  pricingActions: ReactNode;
  onStartPlan: (entry: BlueprintCatalogEntry, seed?: OpportunityPlanSeed) => Promise<boolean>;
}

export function OwnedBlueprintsPanel({
  catalog,
  activeCharacterId,
  ownedByCharacter,
  characterNames,
  rankedRows,
  ownedStockSnapshot,
  loading,
  title,
  leading,
  meta,
  pricingActions,
  onStartPlan,
}: OwnedBlueprintsPanelProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const isDesktop = useIsDesktop();

  const [kind, setKind] = useUrlParam('opps.kind', KIND_PARAM);
  const [activity, setActivity] = useUrlParam(
    OPPORTUNITIES_ACTIVITY_KEY,
    OPPORTUNITIES_ACTIVITY_PARAM
  );
  const [search, setSearch] = useUrlParam('opps.q', SEARCH_PARAM);
  const [includeCorp, setIncludeCorp] = useUrlParam('opps.corp', CORP_PARAM);
  const corp = useCorpOwnedBlueprints();
  const corpBlueprints = corp.available && includeCorp ? corp.blueprints : NO_BLUEPRINTS;

  const baseRows = useMemo(
    () =>
      buildOwnedBlueprintRows({
        ownedByCharacter,
        characterNames,
        corpBlueprints,
        catalog,
        iskPerHourById: NO_ISK,
      }),
    [ownedByCharacter, characterNames, corpBlueprints, catalog]
  );
  const rows = useMemo(() => {
    const iskPerHourById = new Map(
      rankedRows.map((row) => [row.candidate.id, row.result.iskPerHour])
    );
    return baseRows.map((row) => ({ ...row, iskPerHour: iskPerHourById.get(row.id) ?? null }));
  }, [baseRows, rankedRows]);
  const needsReactionLocation = useMemo(
    () => new Set(rankedRows.filter((row) => row.reactionLocation).map((row) => row.candidate.id)),
    [rankedRows]
  );
  const filteredRows = useMemo(
    () => filterOwnedBlueprints(rows, { kind, activity, search }),
    [rows, kind, activity, search]
  );

  const assetsByCharacter = useMemo(() => {
    const map = new Map<number, ReadonlyMap<number, CharacterAsset>>();
    for (const source of ownedStockSnapshot.sources) {
      map.set(source.characterId, new Map(source.assets.map((a) => [a.item_id, a])));
    }
    return map;
  }, [ownedStockSnapshot]);
  const placements = useMemo(() => {
    const map = new Map<string, { placement: BlueprintPlacement; viaCharacterId: number }>();
    for (const row of baseRows) {
      const viaCharacterId =
        row.owner.kind === 'character' ? row.owner.characterId : activeCharacterId;
      const assets =
        row.owner.kind === 'character'
          ? (assetsByCharacter.get(row.owner.characterId) ?? NO_ASSETS)
          : NO_ASSETS;
      map.set(row.id, {
        placement: resolveBlueprintPlacement(row.blueprint, assets),
        viaCharacterId,
      });
    }
    return map;
  }, [baseRows, assetsByCharacter, activeCharacterId]);

  const [locationNames, setLocationNames] = useState<ReadonlyMap<string, string | null>>(new Map());
  const requestedLocations = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    const requested = requestedLocations.current;
    for (const { placement, viaCharacterId } of placements.values()) {
      if (placement.kind !== 'place') continue;
      const key = locationKey(viaCharacterId, placement.locationId);
      if (requested.has(key)) continue;
      requested.add(key);
      void loadBlueprintLocation(viaCharacterId, placement.locationId)
        .then(
          (resolved) => resolved.name,
          () => null
        )
        .then((name) => {
          if (active) setLocationNames((prev) => new Map(prev).set(key, name));
          else requested.delete(key);
        });
    }
    return () => {
      active = false;
    };
  }, [placements]);

  const locationLabel = useCallback(
    (row: OwnedBlueprintRow): string | null => {
      const entry = placements.get(row.id);
      if (!entry) return null;
      if (entry.placement.kind === 'container') return t('industry.ownedBlueprintsInContainer');
      const key = locationKey(entry.viaCharacterId, entry.placement.locationId);
      if (!locationNames.has(key)) return null;
      return locationNames.get(key) ?? t('industry.ownedBlueprintsUnknownLocation');
    },
    [placements, locationNames, t]
  );
  const locationSortValue = useCallback(
    (row: OwnedBlueprintRow) => locationLabel(row) ?? undefined,
    [locationLabel]
  );

  const csvColumns = useMemo(() => ownedBlueprintsCsvColumns(t, locationLabel), [t, locationLabel]);
  const tableExport = useTableExport({
    surface: 'industry-owned-blueprints',
    rows: filteredRows,
    columns: csvColumns,
  });

  const seedById = useMemo(
    () => new Map(rankedRows.map((row) => [row.candidate.id, row] as const)),
    [rankedRows]
  );
  const startRowPlan = (row: OwnedBlueprintRow, entry: BlueprintCatalogEntry) =>
    onStartPlan(entry, seedById.get(row.id));
  const startPlanFromRow = useRowStartPlan(
    (row: OwnedBlueprintRow) =>
      row.catalogEntry ? startRowPlan(row, row.catalogEntry) : Promise.resolve(false),
    (row) => row.catalogEntry
  );

  const columns: DataTableColumn<OwnedBlueprintRow>[] = [
    {
      id: 'blueprint',
      header: t('industry.ownedBlueprintsBlueprint'),
      primary: true,
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.blueprint,
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {row.catalogEntry ? <span className={entityLinkClassName()}>{row.name}</span> : row.name}
          {row.activity === 'reaction' && (
            <span className="text-[0.6875rem] text-text-dim">
              {t('industry.ownedBlueprintsActivity.reaction')}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'kind',
      header: t('industry.ownedBlueprintsKind'),
      width: '10ch',
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.kind,
      render: (row) => (
        <span className={row.kind === 'bpo' ? 'font-medium' : undefined}>
          {row.kind === 'bpo' ? t('industry.bpo') : t('industry.bpc')}
        </span>
      ),
    },
    {
      id: 'me',
      header: t('industry.ownedBlueprintsMe'),
      align: 'right',
      width: '6ch',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.me,
      render: (row) => row.blueprint.material_efficiency,
    },
    {
      id: 'te',
      header: t('industry.ownedBlueprintsTe'),
      align: 'right',
      width: '6ch',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.te,
      render: (row) => row.blueprint.time_efficiency,
    },
    {
      id: 'runs',
      header: t('industry.runs'),
      align: 'right',
      width: COL_SMALL_NUMBER,
      className: 'tabular-nums whitespace-nowrap',
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.runs,
      render: (row) =>
        row.kind === 'bpo' ? t('industry.ownedBlueprintsUnlimitedRuns') : row.blueprint.runs,
    },
    {
      id: 'quantity',
      header: t('industry.quantity'),
      align: 'right',
      width: COL_SMALL_NUMBER,
      className: 'tabular-nums whitespace-nowrap',
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.quantity,
      render: (row) => ownedBlueprintQuantity(row.blueprint),
    },
    {
      id: 'location',
      header: t('industry.ownedBlueprintsLocation'),
      className: 'truncate',
      sortValue: locationSortValue,
      render: (row) => locationLabel(row) ?? t('industry.ownedBlueprintsResolvingLocation'),
    },
    {
      id: 'owner',
      header: t('industry.ownedBlueprintsOwner'),
      width: '18ch',
      className: 'truncate',
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.owner,
      render: (row) => {
        const owner =
          row.owner.kind === 'character'
            ? row.owner.name
            : t('industry.ownedBlueprintsCorporation');
        return owner;
      },
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      width: '12ch',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: OWNED_BLUEPRINT_SORT_VALUE.iskPerHour,
      cellClassName: (row) => (row.iskPerHour !== null ? iskToneClass(row.iskPerHour) : undefined),
      render: (row) =>
        needsReactionLocation.has(row.id)
          ? t('industry.opportunitiesSetReactionLocation')
          : numericCell(row.iskPerHour, (v) => <IskAmount value={v} decimals={0} />, unknown),
    },
    {
      id: 'action',
      header: '',
      width: '18ch',
      render: (row) => {
        const entry = row.catalogEntry;
        return entry ? (
          <StartPlanButton onStart={() => startRowPlan(row, entry)} planKey={entry} />
        ) : null;
      },
    },
  ];

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleOwnedBlueprintsColumns,
    OWNED_BLUEPRINTS_COLUMN_IDS
  );
  const columnsById = Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
    OwnedBlueprintsColumnId,
    DataTableColumn<OwnedBlueprintRow>
  >;
  const shownColumns = columns.filter(
    (column) =>
      !(OWNED_BLUEPRINTS_COLUMN_IDS as readonly string[]).includes(column.id) ||
      isVisible(column.id as OwnedBlueprintsColumnId)
  );
  const sortProps = useUrlSort(
    OWNED_SORT_KEY,
    OWNED_DEFAULT_SORT,
    columns.map((column) => column.id)
  );

  const showOwner = new Set(filteredRows.map(ownedBlueprintOwnerKey)).size > 1;

  const kindOptions = [
    { value: 'all' as const, label: t('industry.ownedBlueprintsAll') },
    { value: 'bpo' as const, label: t('industry.bpo') },
    { value: 'bpc' as const, label: t('industry.bpc') },
  ];

  const filterValue = { kind, activity, includeCorp };
  const activeFilters: ActiveFilter<typeof filterValue>[] = [];
  if (isDesktop && kind !== 'all')
    activeFilters.push({
      label: t('industry.ownedBlueprintsKindFilter'),
      value: t(kind === 'bpo' ? 'industry.bpo' : 'industry.bpc'),
      clear: (value) => ({ ...value, kind: 'all' }),
    });
  if (activity !== 'all')
    activeFilters.push({
      label: t('industry.ownedBlueprintsActivityLabel'),
      value: t(`industry.ownedBlueprintsActivity.${activity}`),
      clear: (value) => ({ ...value, activity: 'all' }),
    });
  if (includeCorp)
    activeFilters.push({
      label: t('industry.ownedBlueprintsIncludeCorp'),
      clear: (value) => ({ ...value, includeCorp: false }),
    });
  function applyFilter(next: typeof filterValue) {
    if (next.kind !== kind) setKind(next.kind);
    if (next.activity !== activity) setActivity(next.activity);
    if (next.includeCorp !== includeCorp) setIncludeCorp(next.includeCorp);
  }

  const filters = (
    <FilterBar
      value={filterValue}
      onChange={applyFilter}
      active={activeFilters}
      resultCount={filteredRows.length}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('industry.ownedBlueprintsSearch')}
          aria-label={t('industry.ownedBlueprintsSearch')}
          className="min-w-48 flex-1"
        />
      }
      actions={
        isDesktop && (
          <ColumnPickerMenu
            available={OWNED_BLUEPRINTS_COLUMN_IDS}
            visible={visible}
            columnsById={columnsById}
            onToggle={toggle}
            onReset={reset}
            buttonLabel={t('common.columnsButton')}
            menuTitle={t('common.columnsMenuTitle')}
            resetLabel={t('common.resetColumns')}
          />
        )
      }
    >
      {(draft, setDraft) => (
        <>
          {isDesktop && (
            <FilterField label={t('industry.ownedBlueprintsKindFilter')} stretch={false}>
              <SegmentedControl
                label={t('industry.ownedBlueprintsKindFilter')}
                size="sm"
                value={draft.kind}
                onChange={(next) => setDraft({ ...draft, kind: next })}
                options={kindOptions}
              />
            </FilterField>
          )}
          <FilterField label={t('industry.ownedBlueprintsActivityLabel')} stretch={false}>
            <SegmentedControl
              label={t('industry.ownedBlueprintsActivityLabel')}
              size="sm"
              value={draft.activity}
              onChange={(next) => setDraft({ ...draft, activity: next })}
              options={activityFilterOptions(t)}
            />
          </FilterField>
          {corp.available && (
            <FilterField
              label={t('industry.ownedBlueprintsIncludeCorp')}
              stretch={false}
              hideCaption
            >
              <FilterChip
                label={t('industry.ownedBlueprintsIncludeCorp')}
                selected={draft.includeCorp}
                onToggle={() => setDraft({ ...draft, includeCorp: !draft.includeCorp })}
              />
            </FilterField>
          )}
        </>
      )}
    </FilterBar>
  );

  return (
    <Panel
      title={title}
      leading={leading}
      meta={meta}
      wrapMeta
      actions={
        <span className="flex items-center gap-2">
          {pricingActions}
          {filteredRows.length > 0 && (
            <TableActionsMenu name={t('industry.ownedBlueprintsTitle')} tableExport={tableExport} />
          )}
        </span>
      }
    >
      {loading ? (
        <Spinner block="panel" label={t('common.loading')} />
      ) : (
        <>
          {filters}
          {!isDesktop && rows.length > 0 && (
            <div className="border-b border-line py-2">
              <SegmentedControl
                label={t('industry.ownedBlueprintsKindFilter')}
                size="sm"
                value={kind}
                onChange={setKind}
                options={kindOptions}
              />
            </div>
          )}
          {rows.length === 0 ? (
            <EmptyState
              title={t('industry.ownedBlueprintsEmptyTitle')}
              hint={t('industry.ownedBlueprintsEmptyHint')}
              className="py-8"
            />
          ) : filteredRows.length === 0 ? (
            <EmptyState title={t('industry.ownedBlueprintsNoMatch')} className="py-8" />
          ) : !isDesktop ? (
            <MobileOwnedBlueprintList
              rows={filteredRows}
              locationLabel={locationLabel}
              showOwner={showOwner}
              onStartPlan={startRowPlan}
            />
          ) : (
            <TableScroll>
              <DataTable
                {...tableExport.tableProps}
                columns={shownColumns}
                rows={filteredRows}
                rowKey={ownedRowKey}
                onRowClick={(row) => {
                  if (row.catalogEntry) startPlanFromRow(row);
                }}
                rowClickable={(row) => Boolean(row.catalogEntry)}
                virtualize="auto"
                label={t('industry.ownedBlueprintsTitle')}
                {...sortProps}
              />
            </TableScroll>
          )}
        </>
      )}
    </Panel>
  );
}
