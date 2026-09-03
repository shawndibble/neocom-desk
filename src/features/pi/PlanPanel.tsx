/**
 * The planetary chain planner: "what does it cost me to make X, and should I
 * make it at all".
 *
 * The opening state this is designed around is **no colonies at all**. Every
 * sourcing floor that buys its inputs is fully answerable with none, so the
 * panel defaults to the P1 floor and gives a real verdict on first paint; the
 * P0 floor is the only one that needs a planet you may not have, and it says
 * so explicitly instead of showing a zero.
 *
 * Layout is a controls rail beside the results on a pointer and stacked above
 * them on a phone, expressed as DOM order in a `md:grid-cols-*` wrapper rather
 * than `order-*` utilities — the results' own internal order (verdict, then
 * chain, then rate table) is load-bearing on a 390px screen and must not be
 * something a visual reorder can quietly undo.
 *
 * Prices come from `loadPlanPrices` over the shared `loadMarketSnapshot`, so a
 * Neocom costs the same here as it does in a Build Plan. The customs rate is
 * derived — not asked for — from the active character's Customs Code
 * Expertise, and the panel says where the number came from, because ESI does
 * not apply the skill and the difference is real ISK.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  NativeSelect,
  Panel,
  Spinner,
  TextInput,
  buttonClassName,
} from '@/components/ui';
import { expandChain, piTier, type ChainLayout, type SourcingFloor } from '@/engine/pi/chain';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import {
  COLONY_SPACES,
  customsRateSource,
  defaultCustomsRate,
  loadCustomsCodeExpertise,
  type ColonySpace,
} from './customsRate';
import { loadPlanPrices, type PlanPrices } from './planPrices';
import { costPlan, factoryPinsAbove, planRows, sensitivityGrid, validFloors } from './planModel';
import { PlanChainTable, PlanSensitivity, PlanVerdict } from './PlanResults';

const HOURS_PER_DAY = 24;

/** The spread the sensitivity table sweeps. The user's own rate is folded in beside them. */
const SENSITIVITY_RATES = [0, 0.05, 0.1, 0.15, 0.2];

const LAYOUTS: readonly ChainLayout[] = ['single-planet', 'planet-per-tier'];

/** Stable identity so the cost memos don't re-run on every render before prices land. */
const NO_PRICES: Readonly<Record<number, number>> = {};

interface ProductOption {
  typeId: number;
  name: string;
  tier: 1 | 2 | 3 | 4;
}

/** Every commodity `pi.json` has a schematic for, tiered off the graph rather than a table. */
function productOptions(pi: PiData): ProductOption[] {
  const options: ProductOption[] = [];
  for (const [key, schematic] of Object.entries(pi.schematics)) {
    const typeId = Number(key);
    let tier: number;
    try {
      tier = piTier(typeId, pi);
    } catch {
      continue;
    }
    if (tier < 1 || tier > 4) continue;
    options.push({ typeId, name: schematic.name, tier: tier as 1 | 2 | 3 | 4 });
  }
  return options.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

function parsePositive(text: string): number | null {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

/**
 * A labelled control. The hint sits *outside* the `<label>` deliberately: a
 * wrapping label folds everything inside it into the control's accessible
 * name, and these hints are two sentences long — the field would announce as
 * "Customs rate (%) 10% highsec NPC base, less 1% per level of...".
 */
function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {label}
        </span>
        {children}
      </label>
      {hint && <p className="text-xs text-text-dim">{hint}</p>}
    </div>
  );
}

export interface PlanPanelProps {
  characterId: number;
  /** Held in the URL by the route, so a plan survives a reload and can be deep-linked. */
  typeId: number | null;
  onTypeIdChange: (typeId: number) => void;
}

export function PlanPanel({ characterId, typeId, onTypeIdChange }: PlanPanelProps) {
  const { t } = useTranslation();

  const [pi, setPi] = useState<PiData | null>(null);
  const [skillLevel, setSkillLevel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [perDayText, setPerDayText] = useState('10');
  const [hubId, setHubId] = useState<TradeHub['id']>(DEFAULT_TRADE_HUB.id);
  const [space, setSpace] = useState<ColonySpace>('highsec');
  /** Null means "follow the band default", which is what lets the provenance line stay honest. */
  const [ratePercentText, setRatePercentText] = useState<string | null>(null);
  const [layout, setLayout] = useState<ChainLayout>('single-planet');
  const [floor, setFloor] = useState<SourcingFloor>('P1');
  const [extractionRateText, setExtractionRateText] = useState('');

  /**
   * Prices, stamped with the request that produced them.
   *
   * Derived-stale rather than cleared in the effect: reading the stamp back
   * out below means a hub switch cannot cost the previous hub's prices while
   * the "not priceable at this hub" line names the new one — and it does it
   * without a synchronous `setState` inside the effect.
   */
  const [priceState, setPriceState] = useState<{ requestKey: string; value: PlanPrices } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [piData, level] = await Promise.all([
          loadPi(),
          // A character with no skill data is `null`, which the rate note
          // reports as unknown rather than as a confident untrained zero.
          loadCustomsCodeExpertise(characterId, Date.now()).catch(() => null),
        ]);
        if (cancelled) return;
        setPi(piData);
        setSkillLevel(level);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const products = useMemo(() => (pi ? productOptions(pi) : []), [pi]);
  const selected = useMemo(
    () =>
      products.find((product) => product.typeId === typeId) ??
      products.find((product) => product.tier === 4) ??
      products[0] ??
      null,
    [products, typeId]
  );

  // Null, not a fallback of 1: costing a blank field at one unit a day would
  // print a confident "Margin per day" for a rate the user never asked for.
  const unitsPerDay = parsePositive(perDayText);
  const hub = TRADE_HUBS.find((candidate) => candidate.id === hubId) ?? DEFAULT_TRADE_HUB;

  const chain = useMemo(() => {
    if (!pi || !selected || unitsPerDay === null) return null;
    try {
      return expandChain(selected.typeId, pi, { unitsPerHour: unitsPerDay / HOURS_PER_DAY });
    } catch {
      return null;
    }
  }, [pi, selected, unitsPerDay]);

  // Keyed on the type list rather than the chain, so changing the daily rate
  // re-costs without re-asking the market for the same prices.
  const priceTypeIdsKey = useMemo(
    () =>
      chain
        ? [...new Set(chain.nodes.map((node) => node.typeId))].sort((a, b) => a - b).join(',')
        : '',
    [chain]
  );

  const priceRequestKey = `${hub.id}|${priceTypeIdsKey}`;

  useEffect(() => {
    if (priceTypeIdsKey === '') return;
    let cancelled = false;
    void (async () => {
      const ids = priceTypeIdsKey.split(',').map(Number);
      const result = await loadPlanPrices(hub, ids);
      if (cancelled) return;
      setPriceState({ requestKey: `${hub.id}|${priceTypeIdsKey}`, value: result });
    })();
    return () => {
      cancelled = true;
    };
  }, [priceTypeIdsKey, hub]);

  const prices = priceState?.requestKey === priceRequestKey ? priceState.value : null;

  const floors = useMemo(() => (selected ? validFloors(selected.tier) : []), [selected]);
  // Derived, not corrected by an effect: a P1 product admits only the P0
  // floor, and the control must never offer one the engine would refuse.
  const effectiveFloor: SourcingFloor = floors.includes(floor)
    ? floor
    : floors.includes('P1')
      ? 'P1'
      : (floors[0] ?? 'P0');

  const rateSource = customsRateSource(space, skillLevel);
  // Rounded off the float noise 0.1 - 4 x 0.01 leaves behind: the field is a
  // percentage a user types into, not an internal fraction.
  const bandDefaultPercent = Math.round(defaultCustomsRate(space, skillLevel) * 10_000) / 100;
  const editedPercent = ratePercentText === null ? null : Number.parseFloat(ratePercentText);
  const ratePercent =
    editedPercent === null || !Number.isFinite(editedPercent) ? bandDefaultPercent : editedPercent;
  const taxRate = ratePercent / 100;

  const extractionRate = parsePositive(extractionRateText);

  const priceMap = prices?.prices ?? NO_PRICES;

  const result = useMemo(
    () =>
      chain
        ? costPlan(chain, {
            prices: priceMap,
            sourcingFloor: effectiveFloor,
            layout,
            taxRate,
            extractionRate,
          })
        : null,
    [chain, priceMap, effectiveFloor, layout, taxRate, extractionRate]
  );

  const rows = useMemo(
    () => (chain ? planRows(chain, effectiveFloor, priceMap) : []),
    [chain, effectiveFloor, priceMap]
  );

  const sensitivityRates = useMemo(
    () => [...new Set([...SENSITIVITY_RATES, taxRate])].sort((a, b) => a - b),
    [taxRate]
  );

  const grid = useMemo(
    () =>
      chain
        ? sensitivityGrid(chain, {
            prices: priceMap,
            floors,
            rates: sensitivityRates,
            layout,
            extractionRate,
          })
        : [],
    [chain, priceMap, floors, sensitivityRates, layout, extractionRate]
  );

  const extractionRateField = (
    <Field label={t('piPlan.extractionRate')}>
      <TextInput
        type="number"
        min={0}
        inputMode="decimal"
        value={extractionRateText}
        placeholder={t('piPlan.extractionRatePlaceholder')}
        onChange={(event) => setExtractionRateText(event.target.value)}
        className="w-full"
      />
    </Field>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (loadFailed || !pi || !selected) {
    return <EmptyState title={t('piPlan.loadFailedTitle')} hint={t('piPlan.loadFailedHint')} />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:items-start">
      {/* First in the DOM, so it stacks above the results on a phone. */}
      <Panel title={t('piPlan.controlsTitle')}>
        <div className="space-y-3">
          <Field label={t('piPlan.product')}>
            <NativeSelect
              value={selected.typeId}
              onChange={(event) => onTypeIdChange(Number(event.target.value))}
              className="w-full"
            >
              {[1, 2, 3, 4].map((tier) => (
                <optgroup key={tier} label={t('piPlan.productGroup', { tier })}>
                  {products
                    .filter((product) => product.tier === tier)
                    .map((product) => (
                      <option key={product.typeId} value={product.typeId}>
                        {product.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>

          <Field label={t('piPlan.outputPerDay')}>
            <TextInput
              type="number"
              min={1}
              inputMode="decimal"
              value={perDayText}
              onChange={(event) => setPerDayText(event.target.value)}
              className="w-full"
            />
          </Field>

          <Field label={t('piPlan.hub')}>
            <NativeSelect
              value={hubId}
              onChange={(event) => setHubId(event.target.value as TradeHub['id'])}
              className="w-full"
            >
              {TRADE_HUBS.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.systemName}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label={t('piPlan.space')} hint={t('piPlan.spaceHint')}>
            <NativeSelect
              value={space}
              onChange={(event) => {
                setSpace(event.target.value as ColonySpace);
                // Back to the band's own default: an override carried across a
                // band change would silently misprice the new one.
                setRatePercentText(null);
              }}
              className="w-full"
            >
              {COLONY_SPACES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {t(`piPlan.spaceOption.${candidate}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field
            label={t('piPlan.customsRate')}
            hint={
              ratePercentText !== null
                ? t('piPlan.rateEdited')
                : rateSource.kind === 'highsec-skill'
                  ? t('piPlan.rateFromHighsecSkill', { level: rateSource.level })
                  : rateSource.kind === 'highsec-unknown-skill'
                    ? t('piPlan.rateFromHighsecUnknown')
                    : t('piPlan.rateFromPlayerPoco')
            }
          >
            <div className="flex items-center gap-2">
              <TextInput
                type="number"
                min={0}
                step={0.5}
                inputMode="decimal"
                value={ratePercentText ?? String(bandDefaultPercent)}
                onChange={(event) => setRatePercentText(event.target.value)}
                className="w-full"
              />
              {ratePercentText !== null && (
                <button
                  type="button"
                  className={buttonClassName({ size: 'md' })}
                  onClick={() => setRatePercentText(null)}
                >
                  {t('piPlan.customsRateReset')}
                </button>
              )}
            </div>
          </Field>

          <Field label={t('piPlan.layout')} hint={t('piPlan.layoutHint')}>
            <NativeSelect
              value={layout}
              onChange={(event) => setLayout(event.target.value as ChainLayout)}
              className="w-full"
            >
              {LAYOUTS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {t(`piPlan.layoutOption.${candidate}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <div className="space-y-1">
            <span
              id="pi-plan-floor-label"
              className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
            >
              {t('piPlan.floor')}
            </span>
            <div
              role="group"
              aria-labelledby="pi-plan-floor-label"
              className="flex flex-wrap gap-1.5"
            >
              {floors.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={candidate === effectiveFloor}
                  onClick={() => setFloor(candidate)}
                  className={buttonClassName({
                    variant: candidate === effectiveFloor ? 'primary' : 'ghost',
                    size: 'md',
                    className: 'px-2.5',
                  })}
                >
                  {t(`piPlan.floorOption.${candidate}`)}
                </button>
              ))}
            </div>
            <span className="block text-xs text-text-dim">{t('piPlan.floorHint')}</span>
          </div>

          {/* One instance only. On the P0 floor the yield field belongs with
              the P0 answer, so the verdict panel owns it there — moving it
              here the moment a rate makes the chain costable would pull the
              field out from under the cursor mid-entry. */}
          {effectiveFloor !== 'P0' && extractionRateField}
        </div>
      </Panel>

      {/* One guard over the whole results column, not just the verdict: a
          chain table full of "Unpriced" rows under a spinner, or left standing
          under a failed price fetch, is the same wrong-with-confidence the
          verdict's own branch avoids. */}
      <div className="min-w-0 space-y-3">
        {chain === null || unitsPerDay === null || result === null ? (
          <Panel>
            <EmptyState
              title={t('piPlan.outputRequiredTitle')}
              hint={t('piPlan.outputRequiredHint')}
              className="py-6"
            />
          </Panel>
        ) : prices?.failed ? (
          <Panel>
            <EmptyState
              title={t('piPlan.pricesFailedTitle')}
              hint={t('piPlan.pricesFailedHint')}
              className="py-6"
            />
          </Panel>
        ) : prices === null ? (
          <Panel>
            <div className="flex justify-center py-10">
              <Spinner label={t('common.loading')} />
            </div>
          </Panel>
        ) : (
          <>
            <PlanVerdict
              result={result}
              targetTier={selected.tier}
              targetName={selected.name}
              unitsPerDay={unitsPerDay}
              factoryPins={factoryPinsAbove(chain, effectiveFloor)}
              hubName={hub.systemName}
              pricesFetchedAt={prices.fetchedAt}
              extractionRateField={effectiveFloor === 'P0' ? extractionRateField : undefined}
            />
            <PlanChainTable rows={rows} productName={selected.name} />
            <PlanSensitivity grid={grid} rates={sensitivityRates} />
          </>
        )}
      </div>
    </div>
  );
}
