import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  InfoTooltip,
  NativeSelect,
  Panel,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { makeOrBuy, type MakeOrBuy, type MaterialRecipe } from '@/engine/industry/makeOrBuy';
import type {
  EffectiveMaterial,
  FacilityKind,
  MaterialSourcing,
  RigLevel,
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
import { buildPlanTypeIds, materialRecipe } from './recipes';
import { loadMarketSnapshot, type MarketSnapshot } from './marketData';
import { formatDuration } from '@/lib/duration';
import { downloadCsv } from '@/lib/downloadCsv';
import { writeToClipboard } from '@/lib/clipboard';
import { unmaskNumber } from '@/lib/numberMask';
import { MaterialsTable, SourcingInput } from './MaterialsTable';
import { materialsCsvColumns } from './materialsCsv';
import { hasShoppingList, shoppingListText } from './shoppingList';
import { expandBuildPlan, subBuildTableRows } from './subBuildPlan';
import { formatIsk } from '@/lib/isk';
import { bulkOwnedStockSuggestions, filterStockByScope } from '@/engine/industry/ownedStock';
import {
  stockLocationLabel,
  type OwnedStockDetection,
  type OwnedStockSnapshot,
} from './ownedStockDetection';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import { ResultsSummary } from './ResultsSummary';
import { BuildSystemInput } from './BuildSystemInput';
import { BuildLocationPicker } from './BuildLocationPicker';
import { buildLocationPatch } from './buildLocationPatch';

/** The Build Plan fields this panel edits; `Industry.tsx` persists exactly these. */
export type PlanPatch = Partial<
  Pick<
    BuildPlanRecord,
    | 'runs'
    | 'me'
    | 'te'
    | 'facility'
    | 'rigLevel'
    | 'security'
    | 'hubId'
    | 'buildSystemId'
    | 'buildSystemName'
    | 'facilityTaxPct'
    | 'ownedStockScope'
    | 'buildHere'
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

/**
 * `SourcingInput.parse` for Runs/ME/TE: unlike the materials sourcing
 * fields it was built for, these three are always-defined numbers with no
 * "unset" state, so blank or unusable input has nowhere to fall but back to
 * `current` — which also, via `SourcingInput`'s "skip onCommit when
 * unchanged" rule, is exactly what makes an emptied-then-abandoned field
 * commit nothing instead of forcing a minimum.
 */
function parseOrKeep(current: number, raw: string, transform: (n: number) => number): number {
  const n = unmaskNumber(raw);
  return n === undefined ? current : transform(n);
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

  // One level deeper than the plan itself needs: the make-or-buy marker
  // quotes each material's own recipe, and a quote is only as good as the
  // inputs it can price. Same batched Fuzzwork call either way. Shared with
  // `useComparedBuildResults.ts` (issue #453) via `buildPlanTypeIds`, so the
  // Compare table widens its price fetch exactly the same way this does.
  const typeIds = useMemo(() => {
    if (!blueprint) return [] as number[];
    return buildPlanTypeIds(blueprint, { catalog, pi });
  }, [blueprint, catalog, pi]);

  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // Distinct from `pricesReady` below: that one collapses "still fetching"
  // and "the live ESI call failed" into the same false, which used to flash
  // the "prices unavailable" warning on every fresh load before the first
  // response landed.
  const [pricesLoading, setPricesLoading] = useState(true);
  /**
   * What the shopping-list button says right now. A clipboard write leaves
   * nothing on screen to look at, so the control has to report itself —
   * `null` is the resting label, and the other two states replace it for a
   * moment. Same beside-the-control confirmation the skill planner's export
   * uses, in the one form a toolbar IconButton has: its own icon and label.
   */
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null);
  // Reset to loading the instant a new fetch is due (hub/typeIds/manual
  // refresh), in the same commit rather than the effect's next tick — same
  // derived-and-cleared-during-render shape as PlanEditor's stale-result
  // clear above.
  // One source for both the index that is fetched and the name that labels it,
  // so the two can never disagree. A plan holding only half the pair (an id
  // with no name, or the reverse) builds at its hub — see `BuildPlanRecord`.
  const buildSystem =
    plan.buildSystemId !== undefined && plan.buildSystemName !== undefined
      ? { id: plan.buildSystemId, name: plan.buildSystemName }
      : null;
  const snapshotKey = `${hub.id}:${buildSystem?.id ?? hub.systemId}:${typeIds.join(',')}:${refreshTick}`;
  const [prevSnapshotKey, setPrevSnapshotKey] = useState(snapshotKey);
  if (prevSnapshotKey !== snapshotKey) {
    setPrevSnapshotKey(snapshotKey);
    setPricesLoading(true);
  }

  useEffect(() => {
    if (!blueprint || typeIds.length === 0) return;
    let cancelled = false;
    void loadMarketSnapshot(hub, typeIds, buildSystem?.id).then((snap) => {
      if (cancelled) return;
      setSnapshot(snap);
      setFetchedAt(new Date());
      setPricesLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // typeIds/blueprint are stable references keyed off `entry` (the catalog Map holds one
    // entry per blueprintTypeID), so this only refires on a real hub, build-system or
    // blueprint change, plus the manual-refresh tick. `catalog`/`pi` land together in one
    // state update on the route, so widening typeIds above cannot make this fire twice.
  }, [hub, typeIds, blueprint, refreshTick, buildSystem?.id]);

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

  // Narrowed to the plan's owned-stock scope (issue #454); `detectedStock`
  // itself stays the full, galaxy-wide picture the breakdown popover shows.
  const scopedStock = useMemo(
    () => filterStockByScope(detectedStock, plan.ownedStockScope),
    [detectedStock, plan.ownedStockScope]
  );

  const detection = useMemo<OwnedStockDetection>(
    () => ({
      stockFor: (typeID) => detectedStock.get(typeID),
      scopedQuantityFor: (typeID) => scopedStock.get(typeID)?.quantity ?? 0,
      lowerBound: incompleteCharacters.length > 0,
      incompleteCharacters,
      characterNameFor: (characterId) => characterNames.get(characterId) ?? t('common.unknown'),
      locationLabelFor: (placement) => stockLocationLabel(placement, locationNames, t),
    }),
    [detectedStock, scopedStock, characterNames, locationNames, incompleteCharacters, t]
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

  /**
   * What produces each material, memoized per type.
   *
   * Deliberately outside the `advice` memo below, which returns nothing until
   * live prices land: a recipe's run count and input quantities need no prices
   * at all, so gating the lookup on them would leave the "build this here"
   * control missing whenever the market was slow or unreachable.
   */
  const recipes = useMemo(() => {
    const byType = new Map<number, MaterialRecipe | null>();
    for (const typeID of materialTypeIds) {
      byType.set(typeID, materialRecipe(typeID, { catalog, pi, ownedBlueprints }));
    }
    return byType;
  }, [materialTypeIds, catalog, pi, ownedBlueprints]);

  // Built once for the blueprint's own materials, so a type outside that set —
  // a recipe input an expansion swapped in — answers "nothing produces this".
  // That is also what keeps the build control off indented rows.
  const recipeFor = useMemo(
    () =>
      (typeID: number): MaterialRecipe | null =>
        recipes.get(typeID) ?? null,
    [recipes]
  );

  // "Use all detected" fills only rows with nothing typed in them: a
  // hand-entered value, including a deliberate 0, is never clobbered by a bulk
  // action. The per-row action is the one that overwrites — clicking it on that
  // row means it.
  const bulkDetectedPatches = useMemo<SourcingPatchEntry[]>(
    () =>
      bulkOwnedStockSuggestions(result?.materials ?? [], plan.materialSourcing, scopedStock).map(
        ({ typeID, ownedQuantity }) => ({ typeID, patch: { ownedQuantity } })
      ),
    [result, plan.materialSourcing, scopedStock]
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
      const verdict = makeOrBuy(material, recipeFor(material.typeID), context);
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
    recipeFor,
  ]);

  /**
   * The plan with the player's chosen sub-builds applied: materials they asked
   * to produce are replaced by what those jobs consume, merged and priced.
   * Falls out to the plan untouched when nothing is expanded.
   */
  const expanded = useMemo(
    () =>
      expandBuildPlan({
        materials: result?.materials ?? [],
        buildHere: plan.buildHere ?? [],
        recipeFor,
        hubPrices: snapshot?.hubPrices ?? {},
        sourcing: plan.materialSourcing,
        ctx: {
          facility: facilityPreset,
          rig: plan.rigLevel,
          security: plan.security,
          facilityTaxPct: facilityPreset.structure ? plan.facilityTaxPct : undefined,
          systemCostIndex: snapshot?.systemCostIndex ?? 0,
          adjustedPrices: snapshot?.adjustedPrices ?? {},
          skills,
        },
      }),
    [
      result,
      plan.buildHere,
      plan.materialSourcing,
      plan.rigLevel,
      plan.security,
      plan.facilityTaxPct,
      facilityPreset,
      recipeFor,
      snapshot,
      skills,
    ]
  );

  const visibleMaterials = useMemo(
    () => (result ? subBuildTableRows(result.materials, expanded) : []),
    [result, expanded]
  );

  /** Wall-clock the sub-jobs add before the main run can even be installed. */
  const subBuildSeconds = useMemo(() => {
    let seconds = 0;
    for (const sub of expanded.subBuilds.values()) seconds += sub.seconds;
    return seconds;
  }, [expanded]);

  // The copy confirmation is a flash, not a state the panel keeps. Cleared by
  // an effect rather than a `setTimeout` inside the handler so unmounting mid-
  // flash, or clicking again before it fades, cancels the pending timer instead
  // of setting state on a gone component.
  useEffect(() => {
    if (copyState === null) return;
    const timer = setTimeout(() => setCopyState(null), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  if (!entry || !blueprint) {
    return <EmptyState title={t('industry.blueprintMissing')} className="py-8" />;
  }

  function update(patch: PlanPatch) {
    onUpdate(patch);
  }

  /**
   * Switches one material between being bought and being produced here.
   *
   * The whole list is rewritten rather than the single entry toggled in place,
   * because it is a plain field on the record — unlike `materialSourcing`,
   * which is a nested map and so needs the read-modify-write path
   * `onSourcingChange` takes.
   */
  function toggleBuildHere(typeID: number) {
    const current = plan.buildHere ?? [];
    update({
      buildHere: current.includes(typeID)
        ? current.filter((id) => id !== typeID)
        : [...current, typeID],
    });
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

  /**
   * Puts the plan's outstanding materials on the clipboard as multibuy text,
   * so the whole run can be ordered in one paste in-game.
   *
   * The rejection is caught and shown, not left to `void`: a browser that
   * denies clipboard access (permission refused, or a page that lost focus
   * between the click and the write) is a real path, and the same silent
   * failure on the read side is already surfaced by ImportClipboardDialog.
   */
  async function copyShoppingList() {
    if (!result) return;
    try {
      // The expanded list, not the plan's own: a material being produced here
      // is not something to order, and the recipe inputs that replaced it are.
      await writeToClipboard(
        shoppingListText(expanded.materials, (id) => nameForType(catalog, id))
      );
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  function exportMaterialsCsv() {
    if (!result) return;
    downloadCsv(
      'build-materials',
      expanded.materials,
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
                <SourcingInput
                  value={plan.runs}
                  label={t('industry.runs')}
                  inputMode="numeric"
                  widthClassName="w-full"
                  // Blank/garbage reverts to the last committed value rather than
                  // snapping to the minimum — clearing the box to retype "10" as
                  // "100" must not overwrite it with 1 mid-edit.
                  parse={(raw) => parseOrKeep(plan.runs, raw, (n) => Math.max(1, Math.round(n)))}
                  onCommit={(runs) => update({ runs })}
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
                <SourcingInput
                  id="build-plan-me"
                  value={plan.me}
                  label={t('industry.me')}
                  inputMode="numeric"
                  widthClassName="w-full"
                  parse={(raw) => parseOrKeep(plan.me, raw, (n) => clampInt(n, 0, 10))}
                  onCommit={(me) => update({ me })}
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
                <SourcingInput
                  id="build-plan-te"
                  value={plan.te}
                  label={t('industry.te')}
                  inputMode="numeric"
                  widthClassName="w-full"
                  parse={(raw) => parseOrKeep(plan.te, raw, (n) => clampInt(n, 0, 20))}
                  onCommit={(te) => update({ te })}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.groupLocationMarket')}
            </h3>
            <div className="mt-2 flex flex-col gap-3">
              <BuildLocationPicker
                summary={t('industry.buildLocationSummary', {
                  facility: facilityPreset.name,
                  system: buildSystem?.name ?? hub.systemName,
                  security: t(`industry.${plan.security}`),
                })}
                onPick={(option) => update(buildLocationPatch(option))}
              >
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

                <BuildSystemInput
                  systemName={buildSystem?.name}
                  hubSystemName={hub.systemName}
                  securityLabel={t(`industry.${plan.security}`)}
                  onChange={(system) =>
                    update({
                      buildSystemId: system?.id,
                      buildSystemName: system?.name,
                      // The band follows the system, so naming one settles the
                      // rig multiplier too. An unreachable ESI leaves the plan
                      // with the band it had rather than a guessed one.
                      ...(system === null
                        ? { security: hub.security }
                        : system.security !== null
                          ? { security: system.security }
                          : {}),
                    })
                  }
                />
              </BuildLocationPicker>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {/* Only a player structure has rig slots or an owner-set tax, so an
                    NPC station shows neither rather than showing them dead. Both
                    are already cleared on the plan when the facility changes. */}
                {facilityPreset.structure && (
                  <label className="flex flex-col gap-1 text-xs">
                    {t('industry.rigLevel')}
                    <NativeSelect
                      value={plan.rigLevel}
                      onChange={(e) => update({ rigLevel: e.target.value as RigLevel })}
                    >
                      <option value="none">{t('industry.rigNone')}</option>
                      <option value="t1">{t('industry.rigT1')}</option>
                      <option value="t2">{t('industry.rigT2')}</option>
                    </NativeSelect>
                  </label>
                )}

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

                <OwnedStockScopeControl
                  scope={plan.ownedStockScope}
                  detectedStock={detectedStock}
                  detection={detection}
                  onChange={(ownedStockScope) => update({ ownedStockScope })}
                />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title={t('industry.materials')}
        actions={
          // `flex-wrap` because this is the one converted toolbar that needs a
          // saved build plan to reach, so it is the one I could not screenshot
          // at 390px. Five items — badge, three controls, duration — beside the
          // panel title, since the shopping-list copy joined the row; if they
          // ever do run out of room, wrapping inside the (min-height, not
          // fixed) header beats clipping.
          <span className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-text-dim">
            {fetchedAt && <DataAgeBadge date={fetchedAt} />}
            {bulkDetectedPatches.length > 0 && (
              <Button size="sm" onClick={() => onSourcingChangeMany(bulkDetectedPatches)}>
                {t('industry.useAllDetected')}
              </Button>
            )}
            {/*
              Gated on there being a remainder to order, not on the table
              having rows: a plan whose every material is already owned still
              renders a full table, and the list it would copy is empty.
            */}
            <IconButton
              size="sm"
              icon={
                copyState === 'copied' ? (
                  <Icon.Done />
                ) : copyState === 'failed' ? (
                  <Icon.Warn />
                ) : (
                  <Icon.CopyToClipboard />
                )
              }
              // Both outcomes change the glyph as well as the tone, so neither
              // is carried by colour alone (docs/DESIGN.md §7).
              tone={copyState === 'failed' ? 'danger' : 'default'}
              label={
                copyState === 'copied'
                  ? t('industry.copyShoppingListDone')
                  : copyState === 'failed'
                    ? t('industry.copyShoppingListFailed')
                    : t('industry.copyShoppingList')
              }
              onClick={() => void copyShoppingList()}
              disabled={!!error || !result || !hasShoppingList(expanded.materials)}
            />
            <IconButton
              size="sm"
              icon={<Icon.Download />}
              label={t('industry.exportCsvMaterials')}
              onClick={exportMaterialsCsv}
              disabled={!!error || !result || expanded.materials.length === 0}
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
          <>
            <MaterialsTable
              materials={visibleMaterials}
              nameFor={(typeID) => nameForType(catalog, typeID)}
              sourcing={plan.materialSourcing}
              pricesReady={pricesReady}
              onSourcingChange={onSourcingChange}
              detection={detection}
              rowContextMenu={materialContextMenu}
              makeOrBuy={advice}
              canBuildHere={(typeID) => recipeFor(typeID)?.method === 'manufacturing'}
              onToggleBuildHere={toggleBuildHere}
            />
            {/*
              Two totals, never one rewritten in place. The materials above are
              what the expanded plan buys; the plan's own material cost is what
              it would have cost to buy the lot. Showing only the new number
              would hide the decision the player just made, and quietly
              contradict the Results panel below — which still prices the plan
              as written, because a sub-build changes what you shop for, not
              what the parent job installs or sells.
            */}
            {expanded.subBuilds.size > 0 && (
              <p className="mt-3 border-t border-line pt-2 text-[0.6875rem] text-text-dim">
                {t('industry.subBuildSummary', {
                  count: expanded.subBuilds.size,
                  materials: formatIsk(expanded.materialCost),
                  fees: formatIsk(expanded.subBuildFees),
                  total: formatIsk(expanded.materialCost + expanded.subBuildFees),
                  planned: formatIsk(result.materialCost),
                })}{' '}
                {t('industry.subBuildTimeNote', { time: formatDuration(subBuildSeconds) })}
              </p>
            )}
          </>
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
            costIndexSystemName={buildSystem?.name ?? hub.systemName}
          />
        </Panel>
      )}
    </div>
  );
}
