import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  FilterChip,
  IconButton,
  InfoTooltip,
  NativeSelect,
  Panel,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { makeOrBuy, type MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type {
  EffectiveMaterial,
  FacilityKind,
  MaterialSourcing,
  RigLevel,
  SecurityBand,
  SkillLevels,
} from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { nameForType, toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { findOwnedBlueprint } from './data';
import { computeBuildPlan } from './computeBuildPlan';
import { materialRecipe, recipeInputTypeIds } from './recipes';
import { loadMarketSnapshot, type MarketSnapshot } from './marketData';
import { formatDuration } from '@/lib/duration';
import { downloadCsv } from '@/lib/downloadCsv';
import { MaterialsTable } from './MaterialsTable';
import { materialsCsvColumns } from './materialsCsv';
import { bulkOwnedStockSuggestions } from '@/engine/industry/ownedStock';
import {
  stockLocationLabel,
  type OwnedStockDetection,
  type OwnedStockSnapshot,
} from './ownedStockDetection';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import { ResultsSummary } from './ResultsSummary';

/** The Build Plan fields this panel edits; `Industry.tsx` persists exactly these. */
export type PlanPatch = Partial<
  Pick<
    BuildPlanRecord,
    'runs' | 'me' | 'te' | 'facility' | 'rigLevel' | 'security' | 'hubId' | 'facilityTaxPct'
  >
>;

/** One material's sourcing edit, for the bulk "use all detected" action. */
export interface SourcingPatchEntry {
  typeID: number;
  patch: MaterialSourcing;
}

interface BuildPlanDetailProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  /** Planetary schematics, for materials no blueprint makes. Null while pi.json loads, or if it failed. */
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  skills: SkillLevels;
  /**
   * Whole-account asset snapshot for owned-stock detection (issue #181),
   * loaded once by `useOwnedStockSnapshot` above this component's own
   * `key={plan.id}` remount boundary in `Industry.tsx` — switching plans
   * must not redo that load, only the (cheap) per-plan aggregation below.
   */
  ownedStockSnapshot: OwnedStockSnapshot;
  onUpdate: (patch: PlanPatch) => void;
  /**
   * One material row’s sourcing edit. Separate from `onUpdate` because it is a
   * read-modify-write of a nested map rather than a whole field, so it has to
   * merge against the stored record, not against this render’s `plan`.
   */
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /**
   * Several rows' sourcing edits at once, for "use all detected". Separate from
   * `onSourcingChange` because the caller has to serialise the writes: each one
   * is a read-modify-write of the same nested map, so firing them concurrently
   * would have later ones merging into a record read before the earlier ones
   * landed.
   */
  onSourcingChangeMany: (patches: readonly SourcingPatchEntry[]) => void;
  /** Materials-row context menu (CONTEXT.md round 26) — the same actions the Market and Assets rows offer. */
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the material under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

/** Build Plan inputs (runs, ME/TE, facility, rig, security, hub, tax) + materials/results. */
export function BuildPlanDetail({
  plan,
  catalog,
  pi,
  ownedBlueprints,
  skills,
  ownedStockSnapshot,
  onUpdate,
  onSourcingChange,
  onSourcingChangeMany,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: BuildPlanDetailProps) {
  const { t } = useTranslation();

  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID) ?? null;
  const blueprint = useMemo(() => (entry ? toIndustryBlueprint(entry.blueprint) : null), [entry]);
  const hub = useMemo(() => getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB, [plan.hubId]);
  const facilityPreset = FACILITY_PRESETS[plan.facility];

  const typeIds = useMemo(() => {
    if (!blueprint) return [] as number[];
    const ids = new Set(blueprint.materials.map((m) => m.typeID));
    const product = blueprint.products[0];
    if (product) ids.add(product.typeID);
    // One level deeper than the plan itself needs: the make-or-buy marker
    // quotes each material's own recipe, and a quote is only as good as the
    // inputs it can price. Same batched Fuzzwork call either way.
    for (const id of recipeInputTypeIds([...ids], { catalog, pi })) ids.add(id);
    return [...ids];
  }, [blueprint, catalog, pi]);

  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // Distinct from `pricesReady` below: that one collapses "still fetching"
  // and "the live ESI call failed" into the same false, which used to flash
  // the "prices unavailable" warning on every fresh load before the first
  // response landed.
  const [pricesLoading, setPricesLoading] = useState(true);
  // Reset to loading the instant a new fetch is due (hub/typeIds/manual
  // refresh), in the same commit rather than the effect's next tick — same
  // derived-and-cleared-during-render shape as PlanEditor's stale-result
  // clear above.
  const snapshotKey = `${hub.id}:${typeIds.join(',')}:${refreshTick}`;
  const [prevSnapshotKey, setPrevSnapshotKey] = useState(snapshotKey);
  if (prevSnapshotKey !== snapshotKey) {
    setPrevSnapshotKey(snapshotKey);
    setPricesLoading(true);
  }

  useEffect(() => {
    if (!blueprint || typeIds.length === 0) return;
    let cancelled = false;
    void loadMarketSnapshot(hub, typeIds).then((snap) => {
      if (cancelled) return;
      setSnapshot(snap);
      setFetchedAt(new Date());
      setPricesLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // typeIds/blueprint are stable references keyed off `entry` (the catalog Map holds one
    // entry per blueprintTypeID), so this only refires on a real hub or blueprint change,
    // plus the manual-refresh tick. `catalog`/`pi` land together in one state
    // update on the route, so widening typeIds above cannot make this fire twice.
  }, [hub, typeIds, blueprint, refreshTick]);

  const ownedMatch = useMemo(
    () => findOwnedBlueprint(ownedBlueprints, plan.blueprintTypeID),
    [ownedBlueprints, plan.blueprintTypeID]
  );

  // Keyed off the blueprint, not the computed cost lines: detected stock does
  // not depend on runs/ME/TE, and this array keys the detection memo.
  const materialTypeIds = useMemo(
    () => (blueprint ? blueprint.materials.map((m) => m.typeID) : []),
    [blueprint]
  );
  const {
    stock: detectedStock,
    characterNames,
    locationNames,
    incompleteCharacters,
  } = useDetectedOwnedStock(ownedStockSnapshot, materialTypeIds);

  const detection = useMemo<OwnedStockDetection>(
    () => ({
      stockFor: (typeID) => detectedStock.get(typeID),
      lowerBound: incompleteCharacters.length > 0,
      incompleteCharacters,
      characterNameFor: (characterId) => characterNames.get(characterId) ?? t('common.unknown'),
      locationLabelFor: (placement) => stockLocationLabel(placement, locationNames, t),
    }),
    [detectedStock, characterNames, locationNames, incompleteCharacters, t]
  );

  const { result, error } = useMemo(() => {
    if (!blueprint) return { result: null, error: t('industry.blueprintMissing') };
    return computeBuildPlan({
      plan,
      blueprint,
      systemCostIndex: snapshot?.systemCostIndex ?? 0,
      adjustedPrices: snapshot?.adjustedPrices ?? {},
      hubPrices: snapshot?.hubPrices ?? {},
      skills,
    });
  }, [plan, blueprint, snapshot, skills, t]);

  const pricesReady =
    snapshot !== null && snapshot.adjustedPrices !== null && snapshot.systemCostIndex !== null;

  // View-only toggle (not persisted): once a material is fully sourced from
  // owned stock there's nothing left to shop for, so hiding it lets a long
  // materials list focus on what still needs buying.
  const [hideOwned, setHideOwned] = useState(false);

  // CSV export deliberately keeps the full set regardless of the toggle: it's
  // a shopping/accounting record, not the on-screen view the toggle curates.
  const visibleMaterials = useMemo(() => {
    if (!result) return [];
    return hideOwned ? result.materials.filter((m) => m.remainingQuantity > 0) : result.materials;
  }, [hideOwned, result]);

  // "Use all detected" fills only rows with nothing typed in them: a
  // hand-entered value, including a deliberate 0, is never clobbered by a bulk
  // action. The per-row action is the one that overwrites — clicking it on that
  // row means it.
  const bulkDetectedPatches = useMemo<SourcingPatchEntry[]>(
    () =>
      bulkOwnedStockSuggestions(result?.materials ?? [], plan.materialSourcing, detectedStock).map(
        ({ typeID, ownedQuantity }) => ({ typeID, patch: { ownedQuantity } })
      ),
    [result, plan.materialSourcing, detectedStock]
  );

  /**
   * Make-or-buy verdict per material (CONTEXT.md round 29), computed once for
   * the table and the CSV export rather than per row render.
   *
   * Gated on `pricesReady` for the same reason the results panel is: without
   * live adjusted prices and a system cost index there is no job fee, and a
   * fee-free quote would call almost everything worth building.
   */
  const advice = useMemo(() => {
    const verdicts = new Map<number, MakeOrBuy>();
    if (!result || !snapshot || snapshot.adjustedPrices === null) return verdicts;
    if (snapshot.systemCostIndex === null) return verdicts;
    const context = {
      facility: facilityPreset,
      rig: plan.rigLevel,
      security: plan.security,
      facilityTaxPct: facilityPreset.structure ? plan.facilityTaxPct : undefined,
      systemCostIndex: snapshot.systemCostIndex,
      adjustedPrices: snapshot.adjustedPrices,
      hubPrices: snapshot.hubPrices,
      skills,
    };
    for (const material of result.materials) {
      const recipe = materialRecipe(material.typeID, { catalog, pi, ownedBlueprints });
      const verdict = makeOrBuy(material, recipe, context);
      if (verdict) verdicts.set(material.typeID, verdict);
    }
    return verdicts;
  }, [
    result,
    snapshot,
    facilityPreset,
    plan.rigLevel,
    plan.security,
    plan.facilityTaxPct,
    skills,
    catalog,
    pi,
    ownedBlueprints,
  ]);

  if (!entry || !blueprint) {
    return <EmptyState title={t('industry.blueprintMissing')} className="py-8" />;
  }

  function update(patch: PlanPatch) {
    onUpdate(patch);
  }

  /**
   * Unlike Market/Assets, this page already holds the whole blueprint catalog
   * (it needs it to render the plan at all), so the "Build Plan" action
   * resolves synchronously — never the `undefined` "checking…" state those
   * lazily-loading callers pass. For a material something else manufactures
   * the action lands back here with `?product=`, creating or selecting that
   * material's own plan so its build-vs-buy read can be compared with this one.
   */
  function materialContextMenu(material: EffectiveMaterial, tr: ReactElement) {
    const name = nameForType(catalog, material.typeID);
    return (
      <ItemContextMenu
        typeId={material.typeID}
        itemName={name}
        blueprintTypeID={catalog.byProductTypeID.get(material.typeID)?.blueprintTypeID ?? null}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
      >
        {tr}
      </ItemContextMenu>
    );
  }

  function exportMaterialsCsv() {
    if (!result) return;
    downloadCsv(
      'build-materials',
      result.materials,
      materialsCsvColumns(
        t,
        (typeID) => nameForType(catalog, typeID),
        plan.materialSourcing,
        pricesReady,
        advice
      )
    );
  }

  return (
    <div className="space-y-4">
      <Panel title={entry.productName}>
        <div className="space-y-4">
          <div>
            <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.groupBlueprint')}
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs">
                {t('industry.runs')}
                <TextInput
                  type="number"
                  min={1}
                  value={plan.runs}
                  onChange={(e) =>
                    update({ runs: Math.max(1, Math.round(Number(e.target.value) || 1)) })
                  }
                />
              </label>

              <div className="flex flex-col gap-1 text-xs">
                <span className="flex items-center gap-1">
                  <label htmlFor="build-plan-me">{t('industry.me')}</label>
                  <InfoTooltip
                    label={t('industry.meTooltipLabel')}
                    content={t('industry.meTooltip')}
                  />
                </span>
                <TextInput
                  id="build-plan-me"
                  type="number"
                  min={0}
                  max={10}
                  value={plan.me}
                  onChange={(e) => update({ me: clampInt(Number(e.target.value), 0, 10) })}
                />
                {ownedMatch && (
                  <span className="text-[0.6875rem] text-text-dim">
                    {t('industry.ownedHint', {
                      me: ownedMatch.material_efficiency,
                      te: ownedMatch.time_efficiency,
                    })}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <span className="flex items-center gap-1">
                  <label htmlFor="build-plan-te">{t('industry.te')}</label>
                  <InfoTooltip
                    label={t('industry.teTooltipLabel')}
                    content={t('industry.teTooltip')}
                  />
                </span>
                <TextInput
                  id="build-plan-te"
                  type="number"
                  min={0}
                  max={20}
                  value={plan.te}
                  onChange={(e) => update({ te: clampInt(Number(e.target.value), 0, 20) })}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.groupLocationMarket')}
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs">
                {t('industry.facility')}
                <NativeSelect
                  value={plan.facility}
                  onChange={(e) => {
                    const facility = e.target.value as FacilityKind;
                    const structure = FACILITY_PRESETS[facility].structure;
                    update(
                      structure
                        ? { facility }
                        : { facility, rigLevel: 'none', facilityTaxPct: undefined }
                    );
                  }}
                >
                  {Object.values(FACILITY_PRESETS).map((f) => (
                    <option key={f.kind} value={f.kind}>
                      {f.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                {t('industry.rigLevel')}
                <NativeSelect
                  value={plan.rigLevel}
                  disabled={!facilityPreset.structure}
                  onChange={(e) => update({ rigLevel: e.target.value as RigLevel })}
                >
                  <option value="none">{t('industry.rigNone')}</option>
                  <option value="t1">{t('industry.rigT1')}</option>
                  <option value="t2">{t('industry.rigT2')}</option>
                </NativeSelect>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                {t('industry.security')}
                <NativeSelect
                  value={plan.security}
                  onChange={(e) => update({ security: e.target.value as SecurityBand })}
                >
                  <option value="highsec">{t('industry.highsec')}</option>
                  <option value="lowsec">{t('industry.lowsec')}</option>
                  <option value="nullsec">{t('industry.nullsec')}</option>
                </NativeSelect>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                {t('industry.tradeHub')}
                <NativeSelect
                  value={plan.hubId}
                  onChange={(e) => update({ hubId: e.target.value as BuildPlanRecord['hubId'] })}
                >
                  {TRADE_HUBS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>

              {facilityPreset.structure && (
                <div className="flex flex-col gap-1 text-xs">
                  <span className="flex items-center gap-1">
                    <label htmlFor="build-plan-facility-tax">{t('industry.facilityTax')}</label>
                    <InfoTooltip
                      label={t('industry.facilityTaxTooltipLabel')}
                      content={t('industry.facilityTaxTooltip')}
                    />
                  </span>
                  <TextInput
                    id="build-plan-facility-tax"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={plan.facilityTaxPct ?? 0}
                    onChange={(e) =>
                      update({ facilityTaxPct: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title={t('industry.materials')}
        actions={
          // `flex-wrap` because this is the one converted toolbar that needs a
          // saved build plan to reach, so it is the one I could not screenshot
          // at 390px. Four items — badge, two controls, duration — beside the
          // panel title; if they ever do run out of room, wrapping inside the
          // (min-height, not fixed) header beats clipping.
          <span className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-text-dim">
            {fetchedAt && <DataAgeBadge date={fetchedAt} />}
            {bulkDetectedPatches.length > 0 && (
              <Button size="sm" onClick={() => onSourcingChangeMany(bulkDetectedPatches)}>
                {t('industry.useAllDetected')}
              </Button>
            )}
            <FilterChip
              label={t('industry.hideOwned')}
              selected={hideOwned}
              onToggle={() => setHideOwned((v) => !v)}
            />
            <IconButton
              size="sm"
              icon={<Icon.Download />}
              label={t('industry.exportCsvMaterials')}
              onClick={exportMaterialsCsv}
              disabled={!!error || !result || result.materials.length === 0}
            />
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('industry.refresh')}
              onClick={() => setRefreshTick((v) => v + 1)}
            />
            {result && <span className="tabular-nums">{formatDuration(result.seconds)}</span>}
          </span>
        }
      >
        {error || !result ? (
          <p className="text-xs text-danger">{error ?? t('industry.computeError')}</p>
        ) : (
          <MaterialsTable
            materials={visibleMaterials}
            nameFor={(typeID) => nameForType(catalog, typeID)}
            sourcing={plan.materialSourcing}
            pricesReady={pricesReady}
            onSourcingChange={onSourcingChange}
            detection={detection}
            rowContextMenu={materialContextMenu}
            makeOrBuy={advice}
          />
        )}
      </Panel>

      {result && !error && (
        <Panel title={t('industry.results')}>
          <ResultsSummary
            result={result}
            pricesReady={pricesReady}
            pricesLoading={pricesLoading}
            systemCostIndex={snapshot?.systemCostIndex ?? null}
            productName={entry.productName}
            productTypeID={entry.productTypeID}
            productUnitPrice={
              entry.productTypeID !== null
                ? (snapshot?.hubPrices[entry.productTypeID] ?? null)
                : null
            }
            productQuantity={
              blueprint.products[0] ? blueprint.products[0].quantity * plan.runs : null
            }
            costIndexSystemName={hub.systemName}
          />
        </Panel>
      )}
    </div>
  );
}
