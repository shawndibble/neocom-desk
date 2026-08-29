import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, InfoTooltip, Panel } from '@/components/ui';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { FacilityKind, RigLevel, SecurityBand, SkillLevels } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { nameForType, toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { findOwnedBlueprint } from './data';
import { computeBuildPlan } from './computeBuildPlan';
import { loadMarketSnapshot, type MarketSnapshot } from './marketData';
import { formatDuration } from './duration';
import { MaterialsTable } from './MaterialsTable';
import { ResultsSummary } from './ResultsSummary';

type PlanPatch = Partial<
  Pick<
    BuildPlanRecord,
    'runs' | 'me' | 'te' | 'facility' | 'rigLevel' | 'security' | 'hubId' | 'facilityTaxPct'
  >
>;

interface BuildPlanDetailProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  ownedBlueprints: readonly CharacterBlueprint[];
  skills: SkillLevels;
  onUpdate: (patch: PlanPatch) => void;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

/** Build Plan inputs (runs, ME/TE, facility, rig, security, hub, tax) + materials/results. */
export function BuildPlanDetail({
  plan,
  catalog,
  ownedBlueprints,
  skills,
  onUpdate,
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
    return [...ids];
  }, [blueprint]);

  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!blueprint || typeIds.length === 0) return;
    let cancelled = false;
    void loadMarketSnapshot(hub, typeIds).then((snap) => {
      if (cancelled) return;
      setSnapshot(snap);
      setFetchedAt(new Date());
    });
    return () => {
      cancelled = true;
    };
    // typeIds/blueprint are stable references keyed off `entry` (the catalog Map holds one
    // entry per blueprintTypeID), so this only refires on a real hub or blueprint change,
    // plus the manual-refresh tick.
  }, [hub, typeIds, blueprint, refreshTick]);

  const ownedMatch = useMemo(
    () => findOwnedBlueprint(ownedBlueprints, plan.blueprintTypeID),
    [ownedBlueprints, plan.blueprintTypeID]
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

  if (!entry || !blueprint) {
    return <EmptyState title={t('industry.blueprintMissing')} className="py-8" />;
  }

  function update(patch: PlanPatch) {
    onUpdate(patch);
  }

  return (
    <div className="space-y-4">
      <Panel title={entry.productName}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            {t('industry.runs')}
            <input
              type="number"
              min={1}
              value={plan.runs}
              onChange={(e) =>
                update({ runs: Math.max(1, Math.round(Number(e.target.value) || 1)) })
              }
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            />
          </label>

          <div className="flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1">
              <label htmlFor="build-plan-me">{t('industry.me')}</label>
              <InfoTooltip label={t('industry.meTooltipLabel')} content={t('industry.meTooltip')} />
            </span>
            <input
              id="build-plan-me"
              type="number"
              min={0}
              max={10}
              value={plan.me}
              onChange={(e) => update({ me: clampInt(Number(e.target.value), 0, 10) })}
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            />
            {ownedMatch && (
              <span className="text-[11px] text-text-dim">
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
              <InfoTooltip label={t('industry.teTooltipLabel')} content={t('industry.teTooltip')} />
            </span>
            <input
              id="build-plan-te"
              type="number"
              min={0}
              max={20}
              value={plan.te}
              onChange={(e) => update({ te: clampInt(Number(e.target.value), 0, 20) })}
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            />
          </div>

          <label className="flex flex-col gap-1 text-xs">
            {t('industry.facility')}
            <select
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
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            >
              {Object.values(FACILITY_PRESETS).map((f) => (
                <option key={f.kind} value={f.kind}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            {t('industry.rigLevel')}
            <select
              value={plan.rigLevel}
              disabled={!facilityPreset.structure}
              onChange={(e) => update({ rigLevel: e.target.value as RigLevel })}
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text disabled:opacity-40"
            >
              <option value="none">{t('industry.rigNone')}</option>
              <option value="t1">{t('industry.rigT1')}</option>
              <option value="t2">{t('industry.rigT2')}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            {t('industry.security')}
            <select
              value={plan.security}
              onChange={(e) => update({ security: e.target.value as SecurityBand })}
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            >
              <option value="highsec">{t('industry.highsec')}</option>
              <option value="lowsec">{t('industry.lowsec')}</option>
              <option value="nullsec">{t('industry.nullsec')}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            {t('industry.tradeHub')}
            <select
              value={plan.hubId}
              onChange={(e) => update({ hubId: e.target.value as BuildPlanRecord['hubId'] })}
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            >
              {TRADE_HUBS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
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
              <input
                id="build-plan-facility-tax"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={plan.facilityTaxPct ?? 0}
                onChange={(e) =>
                  update({ facilityTaxPct: Math.max(0, Number(e.target.value) || 0) })
                }
                className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
              />
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title={t('industry.materials')}
        actions={
          <span className="flex items-center gap-2 text-[11px] text-text-dim">
            {fetchedAt && <DataAgeBadge date={fetchedAt} />}
            <Button size="sm" onClick={() => setRefreshTick((v) => v + 1)}>
              {t('industry.refresh')}
            </Button>
            {result && <span className="tabular-nums">{formatDuration(result.seconds)}</span>}
          </span>
        }
      >
        {error || !result ? (
          <p className="text-xs text-danger">{error ?? t('industry.computeError')}</p>
        ) : (
          <MaterialsTable
            materials={result.materials}
            nameFor={(typeID) => nameForType(catalog, typeID)}
            hubPrices={snapshot?.hubPrices ?? {}}
            pricesReady={pricesReady}
          />
        )}
      </Panel>

      {result && !error && (
        <Panel title={t('industry.results')}>
          <ResultsSummary
            result={result}
            pricesReady={pricesReady}
            systemCostIndex={snapshot?.systemCostIndex ?? null}
            productName={entry.productName}
            productUnitPrice={
              entry.productTypeID !== null
                ? (snapshot?.hubPrices[entry.productTypeID] ?? null)
                : null
            }
            costIndexSystemName={hub.systemName}
          />
        </Panel>
      )}
    </div>
  );
}
