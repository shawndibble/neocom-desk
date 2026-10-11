/**
 * The Builder view: only what a market still needs once the hangar stock
 * there is listed, split by whether the active Character holds a blueprint
 * for it, and one action that turns the buildable part into a Build Group
 * sized to cover each.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, DataTable, Panel, Spinner, Tooltip, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { db } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { runsToCover, timePerRunAtTe } from '@/engine/stockTargets/builder';
import { splitForBuilders, type StockRow } from '@/engine/stockTargets/stockRows';
import { useAssumedMe } from '@/features/industry/assumedMe';
import { useAssumedTe } from '@/features/industry/assumedTe';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { addBuildGroup, useBuildGroups } from '@/features/industry/buildGroups';
import { createBuildPlans } from '@/features/industry/buildPlanStore';
import { findOwnedBlueprint, loadCharacterBlueprints } from '@/features/industry/data';
import { loadActivityFacilityDefaults } from '@/features/industry/facilityDefaults';
import { mostRecentlyUpdatedPlan, newBuildPlan } from '@/features/industry/newBuildPlan';
import { useItemActions } from '@/features/market/itemActions';
import { formatDuration } from '@/lib/duration';
import { formatIskCompact } from '@/lib/isk';
import { StockListNameDialog } from './StockListDialogs';
import { StockStatusPill } from './StockStatus';

interface BuilderRow extends StockRow {
  blueprint: CharacterBlueprint | null;
  timePerRun: number | null;
}

export function StockBuilderView({
  rows,
  nameOf,
  listName,
  activeCharacterId,
  viewSwitch,
}: {
  rows: readonly StockRow[];
  nameOf: (typeId: number) => string;
  listName: string;
  activeCharacterId: number | null;
  /** The Manager / Builder switch, which shares its row with this view's action. */
  viewSwitch: ReactNode;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const navigate = useNavigate();
  const { showInfo } = useItemActions();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [blueprints, setBlueprints] = useState<CharacterBlueprint[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const buildGroups = useBuildGroups((state) => state.value);
  const setBuildGroups = useBuildGroups((state) => state.setValue);
  const hydrateBuildGroups = useBuildGroups((state) => state.hydrate);
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedTe = useAssumedTe((state) => state.value);
  const hydrateMe = useAssumedMe((state) => state.hydrate);
  const hydrateTe = useAssumedTe((state) => state.hydrate);

  useEffect(() => {
    void hydrateBuildGroups();
    void hydrateMe();
    void hydrateTe();
    let cancelled = false;
    void loadBlueprintCatalog().then((c) => {
      if (!cancelled) setCatalog(c);
    });
    const owned =
      activeCharacterId === null
        ? Promise.resolve<CharacterBlueprint[]>([])
        : loadCharacterBlueprints(activeCharacterId).then((result) => result.cached?.data ?? []);
    void owned
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setBlueprints(list);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, hydrateBuildGroups, hydrateMe, hydrateTe]);

  const split = useMemo(() => {
    if (!catalog || !blueprints) return null;
    const ownedFor = (typeId: number) => {
      const entry = catalog.byProductTypeID.get(typeId);
      return entry ? findOwnedBlueprint(blueprints, entry.blueprintTypeID) : null;
    };
    const withBlueprint = (row: StockRow): BuilderRow => {
      const blueprint = ownedFor(row.typeId);
      const entry = catalog.byProductTypeID.get(row.typeId);
      return {
        ...row,
        blueprint,
        timePerRun:
          blueprint && entry
            ? timePerRunAtTe(entry.blueprint.time, blueprint.time_efficiency)
            : null,
      };
    };
    const { buildable, needsBlueprintOrBuy } = splitForBuilders(
      rows,
      (typeId) => ownedFor(typeId) !== null
    );
    return {
      buildable: buildable.map(withBlueprint),
      needs: needsBlueprintOrBuy.map(withBlueprint),
    };
  }, [catalog, blueprints, rows]);

  if (!split) {
    return (
      <div className="space-y-3">
        {viewSwitch}
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  async function addToBuildGroup(name: string) {
    if (activeCharacterId === null || !catalog || !blueprints || !split) return;
    setBusy(true);
    try {
      const [facilityDefaults, plans] = await Promise.all([
        loadActivityFacilityDefaults(),
        db.buildPlans.where('characterId').equals(activeCharacterId).toArray(),
      ]);
      const buildGroupId = crypto.randomUUID();
      const now = Date.now();
      const newPlans = split.buildable.flatMap((row, index) => {
        const entry = catalog.byProductTypeID.get(row.typeId);
        if (!entry) return [];
        const unitsPerRun = entry.blueprint.products[0]?.quantity ?? 1;
        return [
          newBuildPlan(
            activeCharacterId,
            entry,
            row.blueprint,
            mostRecentlyUpdatedPlan(plans),
            facilityDefaults,
            {
              runs: runsToCover(row.toSource, unitsPerRun),
              assumedMe,
              assumedTe,
              buildGroupId,
              updatedAt: now - index,
            }
          ),
        ];
      });
      if (newPlans.length === 0) return;
      // The group goes down before the plans that point at it (buildGroups.ts).
      await setBuildGroups(
        addBuildGroup(buildGroups, activeCharacterId, { id: buildGroupId, name })
      );
      await createBuildPlans(newPlans);
      navigate(`/industry/groups/${buildGroupId}`);
    } finally {
      setBusy(false);
    }
  }

  const blueprintLabel = (bp: CharacterBlueprint | null) => {
    if (!bp) return t('stockTargets.builder.noBlueprint');
    return bp.runs === -1
      ? t('stockTargets.builder.bpo', { me: bp.material_efficiency, te: bp.time_efficiency })
      : t('stockTargets.builder.bpc', { count: bp.runs, me: bp.material_efficiency });
  };

  const columns = (withBlueprintColumns: boolean): DataTableColumn<BuilderRow>[] => [
    {
      id: 'item',
      header: t('stockTargets.table.item'),
      primary: true,
      render: (row) => <span className="font-medium">{nameOf(row.typeId)}</span>,
      sortValue: (row) => nameOf(row.typeId),
    },
    {
      id: 'toBuild',
      header: t('stockTargets.builder.toBuild'),
      align: 'right',
      headerCellClassName: 'sm:w-28',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.builder.toBuildAffix')}` },
      render: (row) => row.toSource.toLocaleString(),
      sortValue: (row) => row.toSource,
    },
    {
      id: 'blueprint',
      header: t('stockTargets.builder.blueprint'),
      headerCellClassName: 'sm:w-44',
      render: (row) => blueprintLabel(row.blueprint),
    },
    ...(withBlueprintColumns
      ? [
          {
            id: 'time',
            header: t('stockTargets.builder.timePerRun'),
            headerTooltip: t('stockTargets.builder.timePerRunHint'),
            align: 'right' as const,
            headerCellClassName: 'sm:w-32 whitespace-nowrap',
            className: 'tabular-nums',
            stackAffix: { after: ` ${t('stockTargets.builder.perRunAffix')}` },
            render: (row: BuilderRow) =>
              row.timePerRun === null ? '—' : formatDuration(row.timePerRun),
            sortValue: (row: BuilderRow) => row.timePerRun ?? undefined,
          },
        ]
      : []),
    {
      id: 'value',
      header: t('stockTargets.builder.marketValue'),
      align: 'right',
      headerCellClassName: 'sm:w-36 whitespace-nowrap',
      className: 'tabular-nums whitespace-nowrap',
      render: (row) =>
        row.costToFill === null ? (
          <span className="text-text-dim">{t('stockTargets.table.noPrice')}</span>
        ) : (
          `${formatIskCompact(row.costToFill)} ISK`
        ),
      sortValue: (row) => row.costToFill ?? -1,
    },
    {
      id: 'status',
      header: t('stockTargets.table.status'),
      headerCellClassName: 'sm:w-24',
      cardCorner: true,
      render: (row) => <StockStatusPill status={row.status} />,
    },
  ];

  const table = (sectionRows: BuilderRow[], label: string, withBlueprintColumns: boolean) => (
    <Panel padded={false}>
      <DataTable
        columns={columns(withBlueprintColumns)}
        rows={sectionRows}
        rowKey={(row) => row.typeId}
        label={label}
        stackLayout="dense"
        className="sm:table-fixed"
        onRowClick={(row) => showInfo(row.typeId, nameOf(row.typeId))}
      />
    </Panel>
  );

  const sectionHeadingClassName =
    'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

  // Build Groups belong to one Character: with none active the action explains itself (§7).
  const addButton = (className: string) => {
    const label = t('stockTargets.builder.addToGroup', { count: split.buildable.length });
    return activeCharacterId === null ? (
      <Tooltip content={t('stockTargets.builder.needsCharacter')}>
        <Button variant="primary" aria-disabled className={className}>
          {label}
        </Button>
      </Tooltip>
    ) : (
      <Button
        variant="primary"
        loading={busy}
        className={className}
        onClick={() => setNaming(true)}
      >
        {label}
      </Button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {viewSwitch}
        <span className="flex-1" />
        {/* Beside the switch on desktop; a phone gets it full width under the lists. */}
        {split.buildable.length > 0 && addButton('hidden sm:inline-flex')}
      </div>
      {split.buildable.length === 0 && split.needs.length === 0 ? (
        <p className="rounded-xs border border-dashed border-line px-3 py-3 text-sm text-text-dim">
          {t('stockTargets.builder.nothingShort')}
        </p>
      ) : (
        <>
          <section aria-labelledby={`${headingId}-can`} className="space-y-2">
            <h2 id={`${headingId}-can`} className={sectionHeadingClassName}>
              {t('stockTargets.builder.canBuild', { count: split.buildable.length })}
            </h2>
            {split.buildable.length > 0 ? (
              table(split.buildable, t('stockTargets.builder.canBuildLabel'), true)
            ) : (
              <p className="text-sm text-text-dim">
                <HintText content={t('stockTargets.builder.noneBuildableHint')}>
                  {t('stockTargets.builder.noneBuildable')}
                </HintText>
              </p>
            )}
          </section>
          {split.needs.length > 0 && (
            <section aria-labelledby={`${headingId}-needs`} className="space-y-2">
              <h2 id={`${headingId}-needs`} className={sectionHeadingClassName}>
                {t('stockTargets.builder.needs', { count: split.needs.length })}
              </h2>
              {table(split.needs, t('stockTargets.builder.needsLabel'), false)}
            </section>
          )}
          {split.buildable.length > 0 && addButton('w-full sm:hidden')}
        </>
      )}
      {naming && (
        <StockListNameDialog
          title={t('stockTargets.builder.groupTitle')}
          confirmLabel={t('stockTargets.builder.groupConfirm')}
          initialName={listName}
          onSubmit={(name) => void addToBuildGroup(name)}
          onClose={() => setNaming(false)}
        />
      )}
    </div>
  );
}
