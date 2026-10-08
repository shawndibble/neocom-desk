/**
 * "What to do with this ore" (issue #2836, design A): an Assets stack of ore
 * set against its three exits: sell it raw, refine it then sell the minerals,
 * or use it in a Build Plan that still has to buy those minerals.
 *
 * Built like the Mining day detail (`YieldDetailModal`): three cards, a
 * "Refines into" table and a "How this is priced" note. Sell now only, at the
 * Market Hub's buy price less sales tax, both exits taxed alike so they compare
 * like with like. The refining facility is an assumption the dialog states.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { cx } from '@/lib/cx';
import {
  DataTable,
  IskAmount,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import { db } from '@/db';
import { useIsPhone } from '@/lib/useIsPhone';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadReprocessing } from '@/sde/loadSde';
import { getHubPrices } from '@/market/prices';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { useComparedBuildResults } from '@/features/industry/useComparedBuildResults';
import { OreIcon, OreLink } from '@/features/miningTax/OreIcon';
import { NO_CHARACTER_MODIFIERS, refiningEfficiency } from '@/engine/industry/characterModifiers';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { salesTaxPct } from '@/engine/industry/fees';
import { SKILL_IDS } from '@/engine/industry/types';
import {
  allocateOreToNeeds,
  planCoverage,
  resolveRefiningRate,
  valueOreExits,
  type OreStack,
} from '@/engine/industry/oreDecision';
import type { ReprocessingMaterial } from '@/engine/industry/reprocessing';
import { useOreRefiningStructureRate } from './refiningFacility';

const CARD = 'rounded-xs border bg-panel-2 p-2.5';
const CARD_SUGGESTED = 'border-accent-dim bg-accent/5';
const CARD_LABEL = 'text-[0.6875rem] font-semibold tracking-widest uppercase';
const CARD_HINT = 'mt-0.5 text-[0.6875rem] text-text-dim';
const TABLE_TITLE_TEXT =
  'border-b border-line bg-panel-2 px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

interface OreRecipe {
  portionSize: number;
  materials: ReprocessingMaterial[];
  specialisationSkillId: number | undefined;
}

interface OreData {
  recipe: OreRecipe | null;
  modifiers: CharacterModifiers;
  hub: TradeHub;
  /** Hub buy price per type id, for the ore and the minerals it refines into. */
  buyPrices: Record<number, number>;
  names: ReadonlyMap<number, string>;
}

interface MineralRow {
  typeId: number;
  quantity: number;
  value: number | null;
}

interface CoverRow {
  typeId: number;
  need: number;
  covered: number;
  percent: number;
}

function Card({
  label,
  suggested,
  children,
  hint,
}: {
  label: string;
  suggested: boolean;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className={cx(CARD, suggested ? CARD_SUGGESTED : 'border-line')}>
      <p className={cx(CARD_LABEL, suggested ? 'text-accent' : 'text-text-dim')}>{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{children}</p>
      {hint && <p className={CARD_HINT}>{hint}</p>}
    </div>
  );
}

export function OreDecisionDialog({
  open,
  onClose,
  typeId,
  itemName,
  quantity,
}: {
  open: boolean;
  onClose: () => void;
  typeId: number;
  itemName: string;
  quantity: number;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hubId = useMarketHub((state) => state.value);
  const structureRate = useOreRefiningStructureRate((state) => state.value);
  const setStructureRate = useOreRefiningStructureRate((state) => state.setValue);
  const [editingYield, setEditingYield] = useState(false);
  const [data, setData] = useState<OreData | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    void useOreRefiningStructureRate.getState().hydrate();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
      const [reprocessing, modifiers] = await Promise.all([
        loadReprocessing(),
        activeCharacterId === null
          ? Promise.resolve(NO_CHARACTER_MODIFIERS)
          : loadCharacterModifiers(activeCharacterId, Date.now()),
      ]);
      const entry = reprocessing[String(typeId)];
      const recipe: OreRecipe | null = entry
        ? {
            portionSize: entry.portionSize,
            materials: entry.materials.map((m) => ({ typeId: m.typeID, quantity: m.quantity })),
            specialisationSkillId: entry.specialisationSkillID,
          }
        : null;
      const ids = [typeId, ...(recipe?.materials.map((m) => m.typeId) ?? [])];
      const [prices, names] = await Promise.all([getHubPrices(hub, ids), loadTypeNames(ids)]);
      const buyPrices: Record<number, number> = {};
      for (const id of ids) {
        const price = prices.get(id)?.buyMax;
        if (price && price > 0) buyPrices[id] = price;
      }
      if (!cancelled) setData({ recipe, modifiers, hub, buyPrices, names });
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId, hubId, activeCharacterId]);

  // Plans: resolved exactly as the Industry index resolves them.
  const workspace = useIndustryWorkspace();
  const plansQuery = useLiveQuery(
    async () =>
      workspace.activeCharacterId === null
        ? []
        : await db.buildPlans.where('characterId').equals(workspace.activeCharacterId).toArray(),
    [workspace.activeCharacterId]
  );
  const plans = useMemo(() => plansQuery ?? [], [plansQuery]);
  const planRows = useComparedBuildResults({
    plans,
    catalog: workspace.catalog,
    pi: workspace.pi,
    ownedBlueprints: workspace.ownedBlueprints,
    modifiers: workspace.modifiers,
    pricingInputs: workspace.pricingInputs,
  });

  const rate = resolveRefiningRate({
    facility: structureRate > 0 ? 'structure' : 'npc',
    typedRate: structureRate,
  });
  const efficiency =
    data?.recipe && data
      ? refiningEfficiency(data.modifiers, data.recipe.specialisationSkillId, rate)
      : 0;
  const taxPct = data ? salesTaxPct(data.modifiers.skills[SKILL_IDS.accounting] ?? 0) : 0;
  const rawUnitPrice = data?.buyPrices[typeId] ?? 0;

  const stack: OreStack | null = useMemo(
    () =>
      data?.recipe
        ? {
            typeId,
            units: quantity,
            portionSize: data.recipe.portionSize,
            materials: data.recipe.materials,
            efficiency,
            rawUnitPrice,
          }
        : null,
    [data, typeId, quantity, efficiency, rawUnitPrice]
  );

  const exits = useMemo(
    () =>
      stack && data
        ? valueOreExits({ stack, mineralPrices: data.buyPrices, salesTaxPct: taxPct })
        : null,
    [stack, data, taxPct]
  );

  /** Plans still buying a mineral this ore refines into, with that remaining need. */
  const eligible = useMemo(() => {
    if (!exits) return [];
    const yields = new Set(exits.outputs.map((o) => o.typeId));
    return planRows.flatMap((row) => {
      if (!row.result) return [];
      const needs: Record<number, number> = {};
      const unitPrice: Record<number, number> = {};
      for (const line of row.result.materials) {
        if (!yields.has(line.typeID) || line.remainingQuantity <= 0) continue;
        needs[line.typeID] = (needs[line.typeID] ?? 0) + line.remainingQuantity;
        unitPrice[line.typeID] = line.unitPrice ?? 0;
      }
      return Object.keys(needs).length === 0 ? [] : [{ row, needs, unitPrice }];
    });
  }, [planRows, exits]);

  const chosen = eligible.find((p) => p.row.planId === planId) ?? eligible[0] ?? null;

  const inPlan = useMemo(() => {
    if (!chosen || !stack) return null;
    const { ores, covered } = allocateOreToNeeds(chosen.needs, [stack]);
    let value = 0;
    for (const [id, qty] of Object.entries(covered))
      value += qty * (chosen.unitPrice[Number(id)] ?? 0);
    return {
      value,
      unitsNotUsed: ores[0].unitsNotUsed,
      coverage: planCoverage(chosen.needs, covered),
    };
  }, [chosen, stack]);

  const name = (id: number) => data?.names.get(id) ?? `#${id}`;
  const nameCell = (id: number) => (
    <span className="flex items-center gap-1.5">
      <OreIcon typeId={id} size={32} className="h-5 w-5 shrink-0" />
      <span className="truncate">
        <OreLink typeId={id}>{name(id)}</OreLink>
      </span>
    </span>
  );

  const refinedRows: MineralRow[] = (exits?.outputs ?? []).map((o) => {
    const price = data?.buyPrices[o.typeId];
    return { typeId: o.typeId, quantity: o.quantity, value: price ? price * o.quantity : null };
  });
  const refinedColumns: DataTableColumn<MineralRow>[] = [
    {
      id: 'material',
      header: t('assets.oreDecision.materialColumn'),
      stickyStart: true,
      render: (r) => nameCell(r.typeId),
      sortValue: (r) => name(r.typeId),
    },
    {
      id: 'quantity',
      header: t('assets.oreDecision.unitsColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (r) => r.quantity.toLocaleString(),
      sortValue: (r) => r.quantity,
    },
    {
      id: 'value',
      header: t('assets.oreDecision.valueColumn'),
      align: 'right',
      className: 'whitespace-nowrap text-text-dim',
      render: (r) => (r.value === null ? '—' : <IskAmount value={r.value} decimals={0} />),
      sortValue: (r) => r.value ?? undefined,
    },
  ];
  const coverColumns: DataTableColumn<CoverRow>[] = [
    {
      id: 'material',
      header: t('assets.oreDecision.materialColumn'),
      stickyStart: true,
      render: (r) => nameCell(r.typeId),
      sortValue: (r) => name(r.typeId),
    },
    {
      id: 'covered',
      header: t('assets.oreDecision.coveredColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (r) => `${r.covered.toLocaleString()} / ${r.need.toLocaleString()}`,
      sortValue: (r) => r.covered,
    },
    {
      id: 'percent',
      header: t('assets.oreDecision.percentColumn'),
      align: 'right',
      className: 'whitespace-nowrap text-text-dim tabular-nums',
      render: (r) => `${r.percent}%`,
      sortValue: (r) => r.percent,
    },
  ];

  const sellRaw = exits?.sellRaw ?? 0;
  const refine = exits?.refineThenSell ?? 0;
  const useValue = inPlan?.value ?? 0;
  const best = Math.max(sellRaw, refine, useValue);
  const suggestedKey =
    best <= 0 ? null : useValue === best ? 'plan' : refine === best ? 'refine' : 'raw';

  const facilityLabel =
    structureRate > 0
      ? t('assets.oreDecision.facilityStructure')
      : t('assets.oreDecision.facilityNpc');
  const percentText = (efficiency * 100).toFixed(1);

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement={isPhone ? 'sheet-full' : 'wide'}
      title={t('assets.oreDecision.title', { name: itemName, count: quantity })}
    >
      <div className="space-y-3 text-sm">
        {data === null || exits === null ? (
          <p className="text-text-dim">
            {data === null ? t('assets.oreDecision.loading') : t('assets.oreDecision.noRecipe')}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card
                label={t('assets.oreDecision.sellRawCard')}
                suggested={suggestedKey === 'raw'}
                hint={t('assets.oreDecision.sellRawHint', { hub: data.hub.name })}
              >
                {sellRaw > 0 ? <IskAmount value={sellRaw} decimals={0} /> : '—'}
              </Card>
              <Card
                label={t('assets.oreDecision.refineCard')}
                suggested={suggestedKey === 'refine'}
                hint={t('assets.oreDecision.refineHint', {
                  efficiency: percentText,
                  facility: facilityLabel,
                })}
              >
                {refine > 0 ? <IskAmount value={refine} decimals={0} /> : '—'}
              </Card>
              <Card
                label={t('assets.oreDecision.useInPlanCard')}
                suggested={suggestedKey === 'plan'}
                hint={
                  chosen
                    ? t('assets.oreDecision.useInPlanHint', { plan: chosen.row.planName })
                    : t('assets.oreDecision.useInPlanNone')
                }
              >
                {inPlan && useValue > 0 ? <IskAmount value={useValue} decimals={0} /> : '—'}
              </Card>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xs border border-line">
                <p className={TABLE_TITLE_TEXT}>{t('assets.oreDecision.refinesIntoTitle')}</p>
                {refinedRows.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-text-dim">
                    {t('assets.oreDecision.refinesIntoNone')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <DataTable
                      columns={refinedColumns}
                      rows={refinedRows}
                      rowKey={(r) => r.typeId}
                      label={t('assets.oreDecision.refinesIntoTitle')}
                      responsive="table"
                    />
                  </div>
                )}
                {exits.unitsLeftOver > 0 && (
                  <p className="border-t border-line px-2.5 py-1.5 text-[0.6875rem] text-warning">
                    {t('assets.oreDecision.leftOverHint', {
                      units: exits.unitsLeftOver.toLocaleString(),
                    })}
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-xs border border-line">
                <div className={cx(TABLE_TITLE_TEXT, 'flex items-center justify-between gap-2')}>
                  <span>
                    {chosen
                      ? t('assets.oreDecision.coversTitle', { plan: chosen.row.planName })
                      : t('assets.oreDecision.coversTitleNone')}
                  </span>
                  {eligible.length > 1 && chosen && (
                    <Select value={chosen.row.planId} onValueChange={setPlanId}>
                      <SelectTrigger size="sm" aria-label={t('assets.oreDecision.planPicker')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {eligible.map((p) => (
                          <SelectItem key={p.row.planId} value={p.row.planId}>
                            {p.row.planName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {inPlan ? (
                  <>
                    <div className="overflow-x-auto">
                      <DataTable
                        columns={coverColumns}
                        rows={inPlan.coverage}
                        rowKey={(r) => r.typeId}
                        label={t('assets.oreDecision.coversTitleNone')}
                        responsive="table"
                      />
                    </div>
                    <p className="border-t border-line px-2.5 py-1.5 text-[0.6875rem] text-text-dim">
                      {t('assets.oreDecision.notUsedHint', {
                        units: inPlan.unitsNotUsed.toLocaleString(),
                      })}
                    </p>
                  </>
                ) : (
                  <p className="px-2.5 py-2 text-xs text-text-dim">
                    {t('assets.oreDecision.noPlanNeeds')}
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xs border border-line">
              <p className={TABLE_TITLE_TEXT}>{t('assets.oreDecision.pricingTitle')}</p>
              <div className="space-y-1.5 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-text-dim">
                <p>
                  {t('assets.oreDecision.pricingBasis', {
                    hub: data.hub.name,
                    tax: taxPct.toFixed(2),
                  })}
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  <span>
                    {t('assets.oreDecision.yieldAssumption', {
                      efficiency: percentText,
                      facility: facilityLabel,
                    })}
                  </span>
                  <button
                    type="button"
                    className={textActionClassName()}
                    onClick={() => setEditingYield((v) => !v)}
                    aria-expanded={editingYield}
                  >
                    {t('assets.oreDecision.editYield')}
                  </button>
                </p>
                {editingYield && (
                  <label className="flex flex-wrap items-center gap-2">
                    <span>{t('assets.oreDecision.structureRateLabel')}</span>
                    <TextInput
                      size="sm"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.1}
                      className="w-24"
                      defaultValue={structureRate > 0 ? (structureRate * 100).toFixed(1) : ''}
                      placeholder="50"
                      onChange={(e) => {
                        const pct = Number(e.target.value);
                        void setStructureRate(
                          Number.isFinite(pct) && pct > 0 && e.target.value !== '' ? pct / 100 : 0
                        );
                      }}
                    />
                    <span>{t('assets.oreDecision.structureRateHint')}</span>
                  </label>
                )}
                {!exits.pricedAll && (
                  <p className="text-warning">{t('assets.oreDecision.partialPricing')}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
