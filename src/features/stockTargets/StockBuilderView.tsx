/**
 * The Builder view: only what a market still needs once the hangar stock
 * there is listed, split by whether the active Character holds a blueprint
 * for it, and one action that turns the buildable part into a Build Group
 * sized to cover each.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, DataTable, IskAmount, Panel, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { DataGate } from '@/components/DataGate';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
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
import { cx } from '@/lib/cx';
import { formatDuration } from '@/lib/duration';
import { StockListNameDialog } from './StockListDialogs';
import { StockStatusPill } from './StockStatus';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { formatNumber } from '@/lib/numberLocale';

interface BuilderRow extends StockRow {
  blueprint: CharacterBlueprint | null;
  timePerRun: number | null;
}

export function StockBuilderView({
  rows,
  nameOf,
  listName,
  activeCharacterId,
}: {
  rows: readonly StockRow[];
  nameOf: (typeId: number) => string;
  listName: string;
  activeCharacterId: number | null;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const navigate = useNavigate();
  const { showInfo } = useItemActions();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const {
    failed: catalogFailed,
    attempt: catalogAttempt,
    fail: failCatalog,
    clear: clearCatalogFailure,
    retry: retryCatalog,
  } = useRetryableLoad();
  const [blueprints, setBlueprints] = useState<CharacterBlueprint[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const buildGroups = useBuildGroups((state) => state.value);
  const setBuildGroups = useBuildGroups((state) => state.setValue);
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedTe = useAssumedTe((state) => state.value);
  useHydratedStore(useBuildGroups, useAssumedMe, useAssumedTe);

  useEffect(() => {
    let cancelled = false;
    clearCatalogFailure();
    loadBlueprintCatalog().then(
      (c) => {
        if (!cancelled) setCatalog(c);
      },
      () => {
        if (!cancelled) failCatalog();
      }
    );
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
  }, [activeCharacterId, catalogAttempt, failCatalog, clearCatalogFailure]);

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

  // One DataGate in either return keeps its focus region mounted across them.
  if (!split) {
    return (
      <DataGate
        status={catalogFailed && !catalog ? 'failed' : 'busy'}
        title={t('industry.catalogUnavailable')}
        onRetry={retryCatalog}
      />
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
    if (!bp) return null;
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
      render: (row) => formatNumber(row.toSource),
      sortValue: (row) => row.toSource,
    },
    // Needs-blueprint table: no row has one; its heading says so.
    ...(withBlueprintColumns
      ? [
          {
            id: 'blueprint',
            header: t('stockTargets.builder.blueprint'),
            headerCellClassName: 'sm:w-44',
            render: (row: BuilderRow) => blueprintLabel(row.blueprint),
          },
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
          <>
            <IskAmount value={row.costToFill} /> ISK
          </>
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

  const sectionHeadingClassName = eyebrowClassName;

  // Build Groups belong to one Character: with none active the action explains itself (§7).
  const addButton = (className: string) => {
    const label = t('stockTargets.builder.addToGroup', { count: split.buildable.length });
    return activeCharacterId === null ? (
      <span className={cx('flex flex-col items-end gap-1', className)}>
        <Button variant="primary" aria-disabled aria-describedby={`${headingId}-why`}>
          {label}
        </Button>
        <span id={`${headingId}-why`} className="text-xs text-text-dim">
          {t('stockTargets.builder.needsCharacter')}
        </span>
      </span>
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
    <DataGate status="ok" title={t('industry.catalogUnavailable')}>
      <div className="space-y-3">
        {split.buildable.length === 0 && split.needs.length === 0 ? (
          <p className="rounded-xs border border-dashed border-line px-3 py-3 text-sm text-text-dim">
            {t('stockTargets.builder.nothingShort')}
          </p>
        ) : (
          <>
            <section aria-labelledby={`${headingId}-can`} className="space-y-2">
              {/* Desktop: on the heading line. Phone: full width under the lists. */}
              <div className="flex items-end gap-2">
                <h3 id={`${headingId}-can`} className={cx('flex-1', sectionHeadingClassName)}>
                  {t('stockTargets.builder.canBuild', { count: split.buildable.length })}
                </h3>
                {split.buildable.length > 0 && (
                  <div className="hidden sm:block">{addButton('')}</div>
                )}
              </div>
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
                <h3 id={`${headingId}-needs`} className={sectionHeadingClassName}>
                  {t('stockTargets.builder.needs', { count: split.needs.length })}
                </h3>
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
    </DataGate>
  );
}
