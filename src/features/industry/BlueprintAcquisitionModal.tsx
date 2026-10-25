import { idSetKey } from '@/lib/idSetKey';
/**
 * The Blueprint Acquisition modal (issues #839, #1240): opened from an icon on
 * any Blueprint Acquisition row (the top-level plan or any nested sub-build),
 * it lays every way to get this blueprint side by side — Owned tiers, public
 * Contracts (copies and originals), Market sell orders, LP Store offers,
 * Invent (issue #3990) and a Manual entry — each row with a "Use this
 * blueprint" button.
 *
 * Picking writes `MaterialSourcing.acquisitionTierOverride` (+ `overridePrice`
 * except for an owned or invent row), keyed by the blueprint's own typeID, via
 * the caller's `onSourcingChange` — `acquisitionForLookup` (`recipes.ts`)
 * then honors it at every node that resolves this blueprint. What each row
 * writes, and why a picked price is one purchase of that row, lives in
 * `blueprintAcquisitionSources.ts`'s `overridePatchFor`.
 *
 * Invent's numbers come from the caller (`inventionQuoteFor`), priced as
 * automatic selection prices them — at the plan's own hub and build system,
 * not this modal's hub picker.
 *
 * Contracts and Market read one Trade Hub's region — the Build Plan's own by
 * default; Market reads the whole region (not just the hub station), unless
 * the blueprint trades in a Global Market Region. The hub picker here only
 * changes what this modal shows, never the plan. Contracts can widen to every
 * region.
 *
 * Data is self-fetched on open, the same pattern `ItemDetailModal` uses: the
 * Public Contract Offers snapshot (`loadPublicBpcContracts`, cached), the
 * hub region's Order Book view (`loadOrderBookView` — cached underneath,
 * failed kept distinct from empty), and the
 * character's LP corps' offers (`findLpOfferMatches`). Station names come
 * from the local SDE snapshot only (`loadContractLocationInfo`) — no ESI
 * call per row; a player structure stays unnamed.
 */
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { blueprintLpRate } from '@/engine/loyalty/marketLpValue';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FieldError,
  IconButton,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextInput,
} from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import { clampMe } from '@/engine/industry/efficiency';
import type { MaterialSourcing } from '@/engine/industry/types';
import { romanLevel } from '@/engine/projection';
import { loadTypeName } from '@/features/character/typeNames';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { loadContractLocationInfo } from '@/features/bpcContracts/blueprintLocation';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import { useLpValue } from '@/features/loyalty/lpValue';
import { LpValueField } from '@/features/settings/LpValueSettingsForm';
import { LpStoreLink } from '@/features/loyalty/LpStoreLink';
import type { ItemMenuFor } from '@/features/market/ItemContextMenu';
import { findLpOfferMatches, type LpOfferMatch } from '@/features/market/appraisalLpAcquisition';
import {
  loadGlobalMarketOverrides,
  loadOrderBookView,
  orderBookLocationFor,
  type OrderBookView,
} from '@/features/market/orderBookView';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { unmaskNumber } from '@/lib/numberMask';
import { formatIsk } from '@/lib/isk';
import {
  cheapestInventRow,
  cheapestRow,
  contractOfferRows,
  groupContractOffers,
  groupMarketSells,
  inventTierRows,
  isCurrentPick,
  lpOfferRows,
  marketSellRows,
  overridePatchFor,
  ownedTierRows,
  runsForPickedRow,
  sectionRows,
  type AcquisitionOwnedCopy,
  type AcquisitionSourceRow,
  type ContractOfferRow,
  type InventTierRow,
  type LpOfferRow,
  type MarketSellRow,
  type OfferGroup,
} from './blueprintAcquisitionSources';
import { loadLpTurnInPricer } from './blueprintPurchaseOffers';
import { formatPercent } from './format';
import type { InventionQuoteResult } from './inventionSources';
import { useHydratedStore } from '@/lib/useHydratedStore';

export type { AcquisitionOwnedCopy } from './blueprintAcquisitionSources';

/** `loading` until the fetch lands; `unavailable` = nothing to read (sync off, fetch failed). */
type Load<T> = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; data: T };
/** Long enough that a section served from cache never flashes the arc. */
const LOADING_SPINNER_DELAY_MS = 200;

const ALL_REGIONS = 'all';
const HUB_REGION = 'hub';
type ContractScope = typeof HUB_REGION | typeof ALL_REGIONS;

const HEADING_CLASS = eyebrowClassName;
const SECTION_CLASS = 'flex flex-col gap-2 border-t border-line pt-3';

interface BlueprintAcquisitionModalProps {
  onClose: () => void;
  characterId: number;
  blueprintTypeID: number;
  blueprintName: string;
  /** Every owned copy of this blueprint — personal and (when the plan's Corp Assets toggle is on) corp-owned, already merged. */
  ownedCopies: readonly AcquisitionOwnedCopy[];
  /** This row's own sourcing entry, for the current override/price (if any). */
  sourcing: MaterialSourcing | undefined;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /**
   * Sets the plan's job runs to what a picked blueprint brings, the way the
   * in-game Industry window fills them in (`runsForPickedRow`). Given only
   * for the plan's own blueprint: a sub-build's runs follow from what the
   * plan needs, not from the copy.
   */
  onPickRuns?: (runs: number) => void;
  /** Navigates to BPC Sourcing pre-filtered to this blueprint. */
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
  /** The Build Plan's own Trade Hub — the modal's starting hub. */
  planHubId: TradeHub['id'];
  /**
   * How inventing this blueprint prices for the plan (issue #3990), and the
   * T1 blueprint it is invented from. Absent/null: nothing invents it, or its
   * prices haven't landed — no Invent section.
   */
  invention?: { result: InventionQuoteResult; t1BlueprintName: string } | null;
  /** Wraps the title (the blueprint's own name) in the item context menu; omitted where the caller has none to offer. */
  itemMenuFor?: ItemMenuFor;
  /**
   * Visible "More actions" button beside the title (WCAG 2.1.1, issue
   * #1498) — the title was a bare `<span>` with no focusable trigger of its
   * own. Omitted where the caller has none to offer.
   */
  itemActionsFor?: (typeId: number) => ReactElement;
}

/** Names for `ids`, resolved one by one as they land; a missing entry means not resolved yet. */
function useNames(
  ids: readonly number[],
  load: (id: number) => Promise<string | null>
): ReadonlyMap<number, string | null> {
  const [names, setNames] = useState<ReadonlyMap<number, string | null>>(new Map());
  // Ids already asked for: a changed id list (new hub, All regions) loads only
  // the new ones, and an in-flight lookup is never cancelled and re-sent.
  const requested = useRef(new Set<number>());
  const mounted = useRef(true);
  // Reset on (re)mount: StrictMode's mount → cleanup → mount would otherwise
  // leave this false and drop every name lookup.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const key = idSetKey(ids);
  useEffect(() => {
    for (const id of key === '' ? [] : key.split(',').map(Number)) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      void load(id)
        .catch(() => null)
        .then((name) => {
          if (mounted.current) setNames((prev) => new Map(prev).set(id, name));
        });
    }
  }, [key, load]);
  return names;
}

const loadStationName = async (id: number) => (await loadContractLocationInfo(id)).name;

/**
 * Runs `load` whenever `key` changes, into a `Load` state. The result is
 * stored against the key it was fetched for, so a changed key (a new hub)
 * reads as loading until its own result lands, and a stale one is dropped.
 */
function useLoad<T>(load: () => Promise<T | null>, key: string): Load<T> {
  // `key` encodes everything `load` reads, so the loader's identity follows
  // the key and a re-render with a fresh closure never reloads on its own.
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });
  const loader = useCallback(() => latest.current(), [key]); // eslint-disable-line react-hooks/exhaustive-deps -- see above
  const result = useKeyedLoad(key, loader);
  if (result.status === 'ready') {
    return result.data === null
      ? { status: 'unavailable' }
      : { status: 'ready', data: result.data };
  }
  return { status: result.status === 'failed' ? 'unavailable' : 'loading' };
}

export function BlueprintAcquisitionModal({
  onClose,
  characterId,
  blueprintTypeID,
  blueprintName,
  ownedCopies,
  sourcing,
  onSourcingChange,
  onPickRuns,
  onSearchBpcSourcing,
  planHubId,
  invention,
  itemMenuFor,
  itemActionsFor,
}: BlueprintAcquisitionModalProps) {
  const { t } = useTranslation();
  const override = sourcing?.acquisitionTierOverride;
  const [manualMe, setManualMe] = useState(String(override?.me ?? 0));
  const [manualTe, setManualTe] = useState(String(override?.te ?? 0));
  const [manualPrice, setManualPrice] = useState(
    sourcing?.overridePrice === undefined ? '' : String(sourcing.overridePrice)
  );
  const [meError, setMeError] = useState(false);
  const [teError, setTeError] = useState(false);
  const manualErrorId = useId();

  const [hubId, setHubId] = useState<TradeHub['id']>(
    getTradeHub(planHubId)?.id ?? DEFAULT_TRADE_HUB.id
  );
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const [contractScope, setContractScope] = useState<ContractScope>(HUB_REGION);

  const lpValue = useLpValue((state) => state.value);
  useHydratedStore(useLpValue);

  const contracts = useLoad(async () => {
    const cached = await loadPublicBpcContracts();
    return cached ? { copies: cached.data.rows, originals: cached.data.originals ?? [] } : null;
  }, String(characterId));
  // Region mode, not Trade Hub mode: every sell order in the hub's region is
  // a real option, and the hub station's own are tagged below.
  const market = useLoad<OrderBookView>(
    async () =>
      loadOrderBookView(
        blueprintTypeID,
        orderBookLocationFor('region', null, hub, await loadGlobalMarketOverrides())
      ),
    `${hub.id}:${blueprintTypeID}`
  );
  const marketView = market.status === 'ready' ? market.data : null;
  const lp = useLoad<readonly LpOfferMatch[]>(
    async () =>
      (await findLpOfferMatches(characterId, [blueprintTypeID])).matchesByTypeId.get(
        blueprintTypeID
      ) ?? [],
    `${characterId}:${blueprintTypeID}`
  );

  // Each section: identical rows folded (contracts, market), unpickable rows
  // dropped unless they are all there is, then capped — cheapest first throughout.
  const owned = sectionRows(ownedTierRows(ownedCopies), () => true);
  const contractGroups = useMemo(
    () =>
      contracts.status === 'ready'
        ? groupContractOffers(
            contractOfferRows({
              ...contracts.data,
              blueprintTypeID,
              regionId: contractScope === ALL_REGIONS ? null : hub.regionId,
            })
          )
        : [],
    [contracts, blueprintTypeID, contractScope, hub.regionId]
  );
  const contractSection = sectionRows(contractGroups, (g) => g.row.pickable);
  const marketGroups = useMemo(
    () =>
      marketView && marketView.status !== 'failed'
        ? groupMarketSells(marketSellRows(marketView.sell, hub.stationId))
        : [],
    [marketView, hub.stationId]
  );
  const marketSection = sectionRows(marketGroups, (g) => g.row.pickable);
  // Turn-ins priced as automatic selection prices them — owned ones free,
  // the rest at this modal's hub — so a picked LP row writes the same price
  // the plan would have chosen for it.
  const lpOffers = lp.status === 'ready' ? lp.data.map((m) => m.offer) : [];
  const turnIns = useLoad(
    () => loadLpTurnInPricer(hub, lpOffers),
    `${hub.id}:${lpOffers.map((o) => o.offer_id).join(',')}`
  );
  // A blueprint's LP is priced at the pilot's own LP Value, else free (LP
  // already earned) — never a store's market rate.
  const lpRows = useMemo(
    () =>
      lp.status === 'ready'
        ? lpOfferRows(
            lp.data,
            blueprintLpRate(lpValue),
            turnIns.status === 'ready' ? turnIns.data : () => null
          )
        : [],
    [lp, lpValue, turnIns]
  );
  const lpSection = sectionRows(lpRows, (r) => r.pickable);
  const inventRows = useMemo(
    () => (invention ? inventTierRows(invention.result.quote) : []),
    [invention]
  );
  const datacoreNames = useNames(
    invention?.result.recipe.datacores.map((d) => d.typeID) ?? [],
    loadTypeName
  );
  const contractRows = contractSection.shown.map((g) => g.row);
  const marketRows = marketSection.shown.map((g) => g.row);

  const stationNames = useNames(
    [...contractRows.map((r) => r.locationId), ...marketRows.map((r) => r.locationId)],
    loadStationName
  );
  const regionNames = useNames(
    [hub.regionId, ...contractRows.map((r) => r.regionId)],
    loadRegionName
  );
  const hubRegionName =
    regionNames.get(hub.regionId) ?? t('industry.bpAcqHubRegion', { hub: hub.systemName });
  const stationName = (id: number) => stationNames.get(id) ?? t('market.unknownStructure');

  function pick(row: AcquisitionSourceRow) {
    onSourcingChange(blueprintTypeID, overridePatchFor(row));
    const runs = runsForPickedRow(row);
    if (runs !== null) onPickRuns?.(runs);
    onClose();
  }

  function useAutomatic() {
    onSourcingChange(blueprintTypeID, {
      acquisitionTierOverride: undefined,
      overridePrice: undefined,
    });
    onClose();
  }

  function applyManual() {
    const me = unmaskNumber(manualMe);
    const te = unmaskNumber(manualTe);
    if (me === undefined || te === undefined) {
      setMeError(me === undefined);
      setTeError(te === undefined);
      return;
    }
    const price = unmaskNumber(manualPrice);
    onSourcingChange(blueprintTypeID, {
      acquisitionTierOverride: {
        me: clampMe(me),
        te: Math.max(0, Math.round(te)),
      },
      overridePrice: price,
    });
    onClose();
  }

  const tier = (row: { me: number; te: number }) =>
    t('industry.blueprintAcquisitionTier', { me: row.me, te: row.te });
  const isk = (value: number) => t('industry.bpAcqIsk', { isk: formatIsk(value) });

  function contractSummary(row: ContractOfferRow): string {
    const parts = [
      row.runs === null
        ? t('industry.bpAcqOriginal')
        : t('industry.bpAcqCopyRuns', { count: row.runs }),
      tier(row),
    ];
    if (row.quantity > 1) parts.push(t('industry.bpAcqQuantity', { count: row.quantity }));
    parts.push(row.price > 0 ? isk(row.price) : t('industry.bpAcqNoPrice'));
    if (row.iskPerRun !== null)
      parts.push(t('industry.bpAcqIskPerRun', { isk: formatIsk(row.iskPerRun) }));
    parts.push(stationName(row.locationId));
    if (contractScope === ALL_REGIONS)
      parts.push(regionNames.get(row.regionId) ?? `#${row.regionId}`);
    return parts.join(' · ');
  }

  function marketSummary(row: MarketSellRow): string {
    return [
      tier(row),
      isk(row.price),
      t('industry.bpAcqOnSale', { count: row.volumeRemain }),
      stationName(row.locationId),
    ].join(' · ');
  }

  function lpSummary(row: LpOfferRow): string {
    const parts = [
      t('industry.blueprintAcquisitionLpOffer', {
        corp: row.corpName,
        isk: formatIsk(row.iskCost),
        lp: formatIsk(row.lpCost),
      }),
      tier(row),
      row.lpRateSource === 'yours' && row.lpRate !== null
        ? t('industry.bpAcqLpPriced', { isk: formatIsk(row.price), rate: formatIsk(row.lpRate) })
        : t('industry.bpAcqLpFree', { isk: formatIsk(row.price) }),
    ];
    if (row.quantity > 1)
      parts.push(t('industry.blueprintAcquisitionLpQuantity', { count: row.quantity }));
    if (row.requiredItemCount > 0)
      parts.push(
        t('industry.blueprintAcquisitionLpRequiredItems', { count: row.requiredItemCount }),
        row.turnInCost === null
          ? t('industry.blueprintAcquisitionLpTurnInsUnpriced')
          : t('industry.blueprintAcquisitionLpTurnInsToBuy', { isk: formatIsk(row.turnInCost) })
      );
    return parts.join(' · ');
  }

  function inventSummary(row: InventTierRow): string {
    const decryptor = row.decryptor;
    return [
      decryptor === null
        ? t('industry.bpAcqInventNoDecryptor')
        : decryptor.unitPrice === null
          ? t('industry.bpAcqInventDecryptorUnpriced', { name: decryptor.name })
          : t('industry.bpAcqInventDecryptor', {
              name: decryptor.name,
              isk: formatIsk(decryptor.unitPrice),
            }),
      formatPercent(row.chance * 100),
      tier(row),
      t('industry.bpAcqInventRuns', { count: row.runs }),
      row.expectedCostPerRun === null
        ? t('industry.bpAcqInventUnpriced')
        : t('industry.bpAcqInventExpectedPerRun', { isk: formatIsk(row.expectedCostPerRun) }),
    ].join(' · ');
  }

  /**
   * One row: its facts, any tags, and the pick button. A plain render
   * function, not a nested component — a component defined in render would
   * remount every row on every render.
   */
  const selectedTag = t('industry.blueprintAcquisitionSelected');

  function renderRow(
    key: string | number,
    row: AcquisitionSourceRow,
    summary: string,
    options: { cheapest?: boolean; tags?: readonly string[]; extra?: ReactNode } = {}
  ) {
    const { cheapest = false, tags = [], extra } = options;
    const current = isCurrentPick(row, sourcing);
    const pickable = row.kind === 'owned' || row.pickable;
    const allTags = [
      ...(cheapest ? [t('industry.bpAcqCheapest')] : []),
      ...(current ? [selectedTag] : []),
      ...tags,
    ];
    return (
      <li
        key={key}
        className={`flex items-start justify-between gap-2 rounded-xs px-1 py-0.5 ${cheapest ? 'bg-panel-2' : ''}`}
      >
        <span className="min-w-0 flex-1 break-words">
          {summary}
          {allTags.map((tag) => (
            <span
              key={tag}
              // Accent is for the selected state only (DESIGN.md); static facts stay dim.
              className={`ml-1.5 inline-block text-[0.625rem] font-semibold tracking-widest uppercase ${tag === selectedTag ? 'text-accent' : 'text-text-dim'}`}
            >
              {tag}
            </span>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {extra}
          <IconButton
            size="sm"
            icon={<Icon.Select />}
            label={t('industry.bpAcqUseRow', { row: summary })}
            tooltip={t('industry.bpAcqUse')}
            disabled={current || !pickable}
            onClick={() => pick(row)}
          />
        </span>
      </li>
    );
  }

  const cheapestContract = cheapestRow(contractRows);
  const cheapestMarket = cheapestRow(marketRows);
  const cheapestLp = cheapestRow(lpSection.shown);
  const cheapestInvent = cheapestInventRow(inventRows);

  const groupCount = (group: OfferGroup<unknown>, key: string) =>
    group.count > 1 ? [t(key, { count: group.count })] : [];

  /** The dim "Showing 10 of N" note, only when the cap cut rows. */
  function capNote(section: { shown: readonly unknown[]; total: number }) {
    if (section.total <= section.shown.length) return null;
    return (
      <p className="text-text-dim">
        {t('industry.bpAcqShowingOf', { shown: section.shown.length, count: section.total })}
      </p>
    );
  }

  function renderInventSection({
    result,
    t1BlueprintName,
  }: {
    result: InventionQuoteResult;
    t1BlueprintName: string;
  }) {
    const { quote, recipe } = result;
    const skills = [
      ...recipe.scienceSkills.map((skill, i) => ({ ...skill, level: result.skills.science[i] })),
      ...(recipe.encryptionSkill
        ? [{ ...recipe.encryptionSkill, level: result.skills.encryption }]
        : []),
    ]
      .map((skill) =>
        t('industry.bpAcqInventSkillLevel', {
          name: skill.name,
          level: romanLevel(skill.level ?? 0),
        })
      )
      .join(', ');
    const fact = (label: string, value: ReactNode) => (
      <>
        <dt className="text-text-dim">{label}</dt>
        <dd className="min-w-0 break-words tabular-nums">{value}</dd>
      </>
    );
    return (
      <section className={SECTION_CLASS}>
        <h3 className={HEADING_CLASS}>{t('industry.bpAcqInventHeading')}</h3>
        <p className="text-text-dim">
          {t('industry.bpAcqInventHint', { blueprint: t1BlueprintName })}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {fact(
            t('industry.bpAcqInventDatacores'),
            <ul className="flex flex-col">
              {quote.datacores.map((d) => {
                const name = datacoreNames.get(d.typeID) ?? `#${d.typeID}`;
                return (
                  <li key={d.typeID}>
                    {d.unitPrice === null || d.lineCost === null
                      ? t('industry.bpAcqInventDatacoreUnpriced', { name, quantity: d.quantity })
                      : t('industry.bpAcqInventDatacoreLine', {
                          name,
                          quantity: d.quantity,
                          price: formatIsk(d.unitPrice),
                          total: formatIsk(d.lineCost),
                        })}
                  </li>
                );
              })}
            </ul>
          )}
          {fact(
            t('industry.bpAcqInventCopyJob'),
            quote.copyJobFee === null
              ? t('industry.bpAcqInventNoOriginal', { blueprint: t1BlueprintName })
              : t('industry.bpAcqInventCopyJobValue', {
                  isk: formatIsk(quote.copyJobFee),
                  blueprint: t1BlueprintName,
                })
          )}
          {fact(t('industry.bpAcqInventFee'), isk(quote.inventionJobFee))}
          {fact(
            t('industry.bpAcqInventChance'),
            <>
              {formatPercent(quote.chance * 100)}{' '}
              <HintText content={skills}>{t('industry.bpAcqInventFromSkills')}</HintText>
            </>
          )}
          {fact(
            t('industry.bpAcqInventAttempt'),
            quote.attemptCost === null
              ? t('industry.bpAcqInventUnpriced')
              : t('industry.bpAcqInventAttemptValue', { isk: formatIsk(quote.attemptCost) })
          )}
        </dl>
        <ul className="flex flex-col gap-1">
          {inventRows.map((row) =>
            renderRow(row.decryptor?.typeID ?? 'none', row, inventSummary(row), {
              cheapest: row === cheapestInvent,
            })
          )}
        </ul>
        <p className="text-text-dim">{t('industry.bpAcqInventFeesNote')}</p>
      </section>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        itemMenuFor
          ? itemMenuFor(
              blueprintTypeID,
              <span>{t('industry.blueprintAcquisitionModalTitle', { name: blueprintName })}</span>
            )
          : t('industry.blueprintAcquisitionModalTitle', { name: blueprintName })
      }
      titleActions={itemActionsFor?.(blueprintTypeID)}
    >
      <div className="flex flex-col gap-4 text-xs">
        <div className="flex flex-col gap-1">
          <span>{t('industry.bpAcqHubLabel')}</span>
          <Select value={hubId} onValueChange={(value) => setHubId(value as TradeHub['id'])}>
            <SelectTrigger size="sm" aria-label={t('industry.bpAcqHubLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRADE_HUBS.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-text-dim">{t('industry.bpAcqHubHint')}</span>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className={HEADING_CLASS}>{t('industry.blueprintAcquisitionOwnedTiers')}</h3>
          {owned.total === 0 ? (
            <p className="text-text-dim">{t('industry.blueprintAcquisitionNoOwnedTiers')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {owned.shown.map((row) =>
                renderRow(
                  `${row.me}:${row.te}`,
                  row,
                  `${tier(row)} · ${
                    row.runs === null
                      ? t('industry.blueprintAcquisitionUnlimitedRuns')
                      : t('industry.blueprintAcquisitionRunsOwned', { count: row.runs })
                  }`
                )
              )}
            </ul>
          )}
          {capNote(owned)}
          {override && (
            <Button size="sm" variant="ghost" onClick={useAutomatic}>
              {t('industry.blueprintAcquisitionUseAutomatic')}
            </Button>
          )}
        </section>

        <section className={SECTION_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={HEADING_CLASS}>{t('industry.bpAcqContractsHeading')}</h3>
            <Select
              value={contractScope}
              onValueChange={(value) => setContractScope(value as ContractScope)}
            >
              <SelectTrigger size="sm" aria-label={t('industry.bpAcqContractRegion')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HUB_REGION}>{hubRegionName}</SelectItem>
                <SelectItem value={ALL_REGIONS}>{t('industry.bpAcqAllRegions')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {contracts.status === 'loading' ? (
            <p className="flex items-center gap-2 text-text-dim">
              <Spinner
                size="sm"
                delayMs={LOADING_SPINNER_DELAY_MS}
                label={t('industry.bpAcqContractsLoading')}
              />
              {t('industry.bpAcqContractsLoading')}
            </p>
          ) : contracts.status === 'unavailable' ? (
            <p className="text-text-dim">{t('industry.bpAcqContractsUnavailable')}</p>
          ) : contractSection.total === 0 ? (
            <p className="text-text-dim">
              {contractScope === ALL_REGIONS
                ? t('industry.bpAcqNoContractsAnywhere')
                : t('industry.bpAcqNoContracts', { region: hubRegionName })}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {contractSection.shown.map((group, index) => {
                const { row } = group;
                return renderRow(
                  // A contract can repeat an identical line; the index keeps keys unique.
                  `${row.contractId}:${row.runs ?? 'bpo'}:${row.me}:${row.te}:${index}`,
                  row,
                  contractSummary(row),
                  {
                    cheapest: row === cheapestContract,
                    tags: [
                      ...groupCount(group, 'industry.bpAcqOfferCount'),
                      ...(row.isStartingBid ? [t('industry.bpAcqStartingBid')] : []),
                      ...(row.isMultiType ? [t('industry.bpAcqBundle')] : []),
                      ...(!row.isMultiType && row.price <= 0 ? [t('industry.bpAcqBarter')] : []),
                    ],
                  }
                );
              })}
            </ul>
          )}
          {capNote(contractSection)}
          <Button size="sm" variant="ghost" onClick={() => onSearchBpcSourcing(blueprintTypeID)}>
            <Icon.Search /> {t('industry.bpAcqSeeAll')}
          </Button>
        </section>

        <section className={SECTION_CLASS}>
          <h3 className={HEADING_CLASS}>{t('industry.bpAcqMarketHeading')}</h3>
          <p className="text-text-dim">{t('industry.bpAcqMarketHint')}</p>
          {marketView?.region.override && (
            <p className="text-text-dim">
              {t('market.globalMarketNote', { regionName: marketView.region.override.regionName })}
            </p>
          )}
          {market.status === 'loading' ? (
            <p className="flex items-center gap-2 text-text-dim">
              <Spinner
                size="sm"
                delayMs={LOADING_SPINNER_DELAY_MS}
                label={t('industry.bpAcqMarketLoading')}
              />
              {t('industry.bpAcqMarketLoading')}
            </p>
          ) : market.status === 'unavailable' || marketView?.status === 'failed' ? (
            <p className="text-text-dim">{t('industry.bpAcqMarketUnavailable')}</p>
          ) : marketSection.total === 0 ? (
            <p className="text-text-dim">
              {t('industry.bpAcqNoSellOrders', {
                region: marketView?.region.override?.regionName ?? hubRegionName,
              })}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {marketSection.shown.map((group) => {
                const { row } = group;
                return renderRow(row.orderId, row, marketSummary(row), {
                  cheapest: row === cheapestMarket,
                  tags: [
                    ...groupCount(group, 'industry.bpAcqOrderCount'),
                    ...(row.atHub ? [t('industry.bpAcqAtHub', { hub: hub.systemName })] : []),
                  ],
                });
              })}
            </ul>
          )}
          {capNote(marketSection)}
        </section>

        <section className={SECTION_CLASS}>
          <h3 className={HEADING_CLASS}>{t('industry.blueprintAcquisitionLpHeading')}</h3>
          {lp.status !== 'loading' &&
          lp.status !== 'unavailable' &&
          lpSection.total === 0 ? null : (
            <>
              <LpValueField id="bp-acq-lp-value" note={t('industry.bpAcqLpValueHint')} />
            </>
          )}
          {lp.status === 'loading' ? (
            <p className="flex items-center gap-2 text-text-dim">
              <Spinner
                size="sm"
                delayMs={LOADING_SPINNER_DELAY_MS}
                label={t('industry.bpAcqLpLoading')}
              />
              {t('industry.bpAcqLpLoading')}
            </p>
          ) : lp.status === 'unavailable' ? (
            <p className="text-text-dim">{t('industry.bpAcqLpUnavailable')}</p>
          ) : lpSection.total === 0 ? (
            <p className="text-text-dim">{t('industry.bpAcqNoLpOffers')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {lpSection.shown.map((row) =>
                renderRow(`${row.corporationId}:${row.offerId}`, row, lpSummary(row), {
                  cheapest: row === cheapestLp,
                  extra: <LpStoreLink corporationId={row.corporationId} label={row.corpName} />,
                })
              )}
            </ul>
          )}
          {capNote(lpSection)}
        </section>

        {invention && renderInventSection(invention)}

        <section className={SECTION_CLASS}>
          <h3 className={HEADING_CLASS}>{t('industry.blueprintAcquisitionManualHeading')}</h3>
          <p className="text-text-dim">{t('industry.blueprintAcquisitionManualHint')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualMe')}
              <TextInput
                size="sm"
                className="w-16"
                inputMode="numeric"
                value={manualMe}
                aria-invalid={meError}
                aria-describedby={meError ? manualErrorId : undefined}
                onChange={(e) => {
                  setManualMe(e.target.value);
                  setMeError(false);
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualTe')}
              <TextInput
                size="sm"
                className="w-16"
                inputMode="numeric"
                value={manualTe}
                aria-invalid={teError}
                aria-describedby={teError ? manualErrorId : undefined}
                onChange={(e) => {
                  setManualTe(e.target.value);
                  setTeError(false);
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualPrice')}
              <TextInput
                size="sm"
                className="w-28"
                inputMode="decimal"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
              />
            </label>
            <IconButton
              icon={<Icon.Select />}
              label={t('industry.bpAcqUseRow', {
                row: t('industry.blueprintAcquisitionManualHeading'),
              })}
              tooltip={t('industry.bpAcqUse')}
              onClick={applyManual}
            />
          </div>
          {(meError || teError) && (
            <FieldError id={manualErrorId}>
              {t('industry.blueprintAcquisitionManualError')}
            </FieldError>
          )}
        </section>
      </div>
    </Modal>
  );
}
