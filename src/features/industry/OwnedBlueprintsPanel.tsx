/**
 * Build Opportunities' "All owned" view (issue #2335): every blueprint the
 * selected Character(s) own — reactions and unrankable ones included — as a
 * browsable library, with the corporation's blueprints behind a toggle for a
 * Character that can read them. Mounted by `OpportunitiesPanel`, which owns
 * the blueprint load, the Character filter and the ranked rows this view
 * borrows ISK/hour from.
 */
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
  type DataTableColumn,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CharacterAsset, CharacterBlueprint } from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import { loadBlueprintLocation } from '@/features/bpcContracts/blueprintLocation';
import { createColumnVisibilitySetting, useColumnVisibility } from '@/lib/columnVisibility';
import { boolParam, enumParam, textParam } from '@/lib/urlState';
import { useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { useIsDesktop } from '@/lib/useIsDesktop';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { useCorpOwnedBlueprints } from './corpOwnedBlueprints';
import { numericCell } from './format';
import { OWNED_DEFAULT_SORT, OWNED_SORT_KEY } from './opportunitiesUrl';
import type { OpportunityRow } from './opportunities';
import {
  OWNED_BLUEPRINT_SORT_VALUE,
  buildOwnedBlueprintRows,
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
const ACTIVITY_PARAM = enumParam(['all', 'manufacturing', 'reaction'] as const, 'all');
const SEARCH_PARAM = textParam();
const CORP_PARAM = boolParam(false);
const SORT_VALUE = OWNED_BLUEPRINT_SORT_VALUE;

const ownedRowKey = (row: OwnedBlueprintRow) => row.id;

const NO_ASSETS: ReadonlyMap<number, CharacterAsset> = new Map();
const NO_BLUEPRINTS: readonly CharacterBlueprint[] = [];
const NO_ISK: ReadonlyMap<string, number | null> = new Map();

/** Location names are resolved per (Character asking, location id). */
const locationKey = (characterId: number, locationId: number) => `${characterId}:${locationId}`;

interface OwnedBlueprintsPanelProps {
  catalog: BlueprintCatalog;
  activeCharacterId: number;
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  characterNames: ReadonlyMap<number, string>;
  /** Opportunities' ranked rows — where a blueprint's ISK/hour comes from. */
  rankedRows: readonly OpportunityRow[];
  ownedStockSnapshot: OwnedStockSnapshot;
  loading: boolean;
  /** Desktop's plain title; unset below `lg`, where `leading`'s view picker stands in for it. */
  title?: string;
  /** The phone view picker that doubles as the title (see `OpportunitiesPanel`). */
  leading?: ReactNode;
  /** The view toggle, Character filter and data age, shared with the ranked view. */
  meta: ReactNode;
  /** Ranked pricing's progress / manual Refresh — the ISK/hour column fills from it. */
  pricingActions: ReactNode;
  onStartPlan: (entry: BlueprintCatalogEntry) => Promise<boolean>;
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
  const [activity, setActivity] = useUrlParam('opps.activity', ACTIVITY_PARAM);
  const [search, setSearch] = useUrlParam('opps.q', SEARCH_PARAM);
  const [includeCorp, setIncludeCorp] = useUrlParam('opps.corp', CORP_PARAM);
  const corp = useCorpOwnedBlueprints();
  const corpBlueprints = corp.available && includeCorp ? corp.blueprints : NO_BLUEPRINTS;

  // Built without ISK/hour first, so ranked pricing landing batch by batch
  // only re-stamps that one field and never re-derives placements below.
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
  const filteredRows = useMemo(
    () => filterOwnedBlueprints(rows, { kind, activity, search }),
    [rows, kind, activity, search]
  );

  // Where each blueprint sits: containers walked up through the owner's
  // cached assets. Corp blueprints have no cached corp assets here, so a
  // containered one falls back to "In container"; its hangar location is
  // resolved through the active Character, who is the one with corp access.
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
  // Each location is asked for once and committed as it lands, so one slow
  // structure lookup never holds back the rest.
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

  /** Null while a name is still resolving. */
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

  const columns: DataTableColumn<OwnedBlueprintRow>[] = [
    {
      id: 'blueprint',
      header: t('industry.ownedBlueprintsBlueprint'),
      primary: true,
      sortValue: SORT_VALUE.blueprint,
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {row.name}
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
      sortValue: SORT_VALUE.kind,
      render: (row) => (
        <span className={row.kind === 'bpo' ? 'font-medium text-accent' : undefined}>
          {row.kind === 'bpo' ? t('industry.bpo') : t('industry.bpc')}
        </span>
      ),
    },
    {
      id: 'me',
      header: t('industry.ownedBlueprintsMe'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.me,
      render: (row) => row.blueprint.material_efficiency,
    },
    {
      id: 'te',
      header: t('industry.ownedBlueprintsTe'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.te,
      render: (row) => row.blueprint.time_efficiency,
    },
    {
      id: 'runs',
      header: t('industry.runs'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.runs,
      render: (row) =>
        row.kind === 'bpo' ? t('industry.ownedBlueprintsUnlimitedRuns') : row.blueprint.runs,
    },
    {
      id: 'quantity',
      header: t('industry.quantity'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.quantity,
      render: (row) => ownedBlueprintQuantity(row.blueprint),
    },
    {
      id: 'location',
      header: t('industry.ownedBlueprintsLocation'),
      sortValue: locationSortValue,
      render: (row) => locationLabel(row) ?? t('industry.ownedBlueprintsResolvingLocation'),
    },
    {
      id: 'owner',
      header: t('industry.ownedBlueprintsOwner'),
      sortValue: SORT_VALUE.owner,
      render: (row) =>
        row.owner.kind === 'character' ? row.owner.name : t('industry.ownedBlueprintsCorporation'),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerHour,
      cellClassName: (row) => (row.iskPerHour !== null ? iskToneClass(row.iskPerHour) : undefined),
      render: (row) =>
        numericCell(
          row.iskPerHour,
          (v) => <IskAmount value={v} revealOn="tap" decimals={0} />,
          unknown
        ),
    },
    {
      id: 'action',
      header: '',
      render: (row) => {
        const entry = row.catalogEntry;
        return entry ? <StartPlanButton onStart={() => onStartPlan(entry)} /> : null;
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
  // The sort ids come from every column, so a URL sort on a hidden column is
  // kept (the table just shows unsorted) and applies again once it's shown.
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

  const showOwner =
    new Set(
      filteredRows.map((row) =>
        row.owner.kind === 'character' ? String(row.owner.characterId) : 'corp'
      )
    ).size > 1;

  const filterValue = { kind, activity, includeCorp };
  // Below `lg` the kind filter sits inline above the cards, not in the sheet,
  // so it doesn't count toward the funnel's badge there.
  const activeFilterCount = [isDesktop && kind !== 'all', activity !== 'all', includeCorp].filter(
    Boolean
  ).length;
  function applyFilter(next: typeof filterValue) {
    if (next.kind !== kind) setKind(next.kind);
    if (next.activity !== activity) setActivity(next.activity);
    if (next.includeCorp !== includeCorp) setIncludeCorp(next.includeCorp);
  }

  const filters = (
    <FilterBar
      value={filterValue}
      onChange={applyFilter}
      activeCount={activeFilterCount}
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
                options={[
                  { value: 'all', label: t('industry.ownedBlueprintsAll') },
                  { value: 'bpo', label: t('industry.bpo') },
                  { value: 'bpc', label: t('industry.bpc') },
                ]}
              />
            </FilterField>
          )}
          <FilterField label={t('industry.ownedBlueprintsActivityLabel')} stretch={false}>
            <SegmentedControl
              label={t('industry.ownedBlueprintsActivityLabel')}
              size="sm"
              value={draft.activity}
              onChange={(next) => setDraft({ ...draft, activity: next })}
              options={[
                { value: 'all', label: t('industry.ownedBlueprintsAll') },
                {
                  value: 'manufacturing',
                  label: t('industry.ownedBlueprintsActivity.manufacturing'),
                },
                { value: 'reaction', label: t('industry.ownedBlueprintsActivity.reaction') },
              ]}
            />
          </FilterField>
          {corp.available && (
            <FilterChip
              label={t('industry.ownedBlueprintsIncludeCorp')}
              selected={draft.includeCorp}
              onToggle={() => setDraft({ ...draft, includeCorp: !draft.includeCorp })}
            />
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
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
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
                options={[
                  { value: 'all', label: t('industry.ownedBlueprintsAll') },
                  { value: 'bpo', label: t('industry.bpo') },
                  { value: 'bpc', label: t('industry.bpc') },
                ]}
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
              onStartPlan={onStartPlan}
            />
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                {...tableExport.tableProps}
                columns={shownColumns}
                rows={filteredRows}
                rowKey={ownedRowKey}
                virtualize="auto"
                label={t('industry.ownedBlueprintsTitle')}
                {...sortProps}
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
