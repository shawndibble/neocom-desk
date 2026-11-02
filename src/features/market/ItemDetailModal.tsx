/**
 * Item Detail (GLOSSARY.md round 6): fitting cost, volume, bonuses and
 * description for one item — the things a shopper checks before deciding
 * whether a price is worth paying. The item's own description, volume and
 * attribute values come from the baked typeInfo shards, falling back to
 * cached ESI (`skills/typeDetail.ts`); only order-book prices need the network.
 * The market snapshot carries the small attribute dictionary that turns
 * attribute ids into names/units/categories.
 * Rows whose value is an id rather than a measurement — a required skill, a
 * Group a module can be fitted to — resolve to names through
 * `attributeReferenceNames.ts`, which starts from `skills.json` (public/data,
 * PWA-precached — not the market snapshot vite.config.ts excludes from
 * precache) and only reaches for ESI for ids no local payload covers. A
 * planetary commodity also gets its schematic (pi.json, precached the same
 * way): for those, "how is this made" is the question the modal is opened to
 * answer, and no dogma attribute carries it. Anything a blueprint or
 * reaction consumes gets "Used in" (`UsedInSection`), off the blueprint
 * catalog — the same SDE files Build Plan reads, not ESI.
 *
 * An Abyssal type or Mutaplasmid gets `AbyssalItemDetail`. No market order
 * exists for an Abyssal type: its price line is MutaMarket's estimate on a
 * Mutated module (`itemId`), else nothing. On a Mutated module the attributes
 * are its own, from ESI's dynamic item.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import {
  fieldBaseClassName,
  focusRingClassName,
  inlineLinkClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useInRouterContext, useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  buttonClassName,
  EmptyState,
  IskAmount,
  MenuItem,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RowActionsContext,
  RowMoreActions,
  Spinner,
  TabPanel,
  Tabs,
  Tooltip,
  TypeIcon,
  useTabsId,
} from '@/components/ui';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import {
  groupItemAttributes,
  type AttributeDictionary,
  type AttributeGroup,
} from '@/engine/market/itemAttributes';
import { EveMarkupText } from '@/components/EveMarkupText';
import { marketItemUrl } from '@/engine/market/urlState';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import {
  findModifyingSkills,
  postPercentMagnitude,
  type ModifyingSkillEffect,
} from '@/engine/market/skillAttributeEffects';
import type { TrainedSkill } from '@/engine/types';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadPi, loadSkillAttributeModifiers, loadSkills } from '@/sde/loadSde';
import type { PiData, SkillAttributeModifierMap } from '@/sde/types';
import { formatDuration } from '@/lib/duration';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { extractRequiredSkills, type RequiredSkill } from '@/features/skills/dogma';
import { useTargetPlan, type TargetPlan } from '@/features/skills/useTargetPlan';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { loadAttributeReferenceNames } from './attributeReferenceNames';
import { formatAttributeValue, formatVolume } from './format';
import { loadTypeDetail, type TypeDetail } from '@/features/skills/typeDetail';
import {
  loadOrderBookView,
  useSavedOrderBookLocation,
  type OrderBookLocation,
} from './orderBookView';
import { ItemMarketTab } from './ItemMarketTab';
import { RequiredSkillsSection } from './RequiredSkillsSection';
import { skillNameOrFallback } from './skillNameOrFallback';
import { MadeFromSection } from './MadeFromSection';
import { UsedInSection } from './UsedInSection';
import { AbyssalItemDetail } from '@/features/abyssal/AbyssalItemDetail';
import { AbyssalEstimateLine } from '@/features/abyssal/AbyssalEstimateLine';
import { useIsAbyssalType } from '@/features/abyssal/mutaplasmidData';
import { useDynamicItem } from '@/features/abyssal/useDynamicItem';
import { recordAttributes } from '@/features/abyssal/dynamicItems';
import type { DynamicItemRecord } from '@/db';
import { formatIsk, formatIskCompact, marketIskDecimals } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';

export interface ItemDetailModalProps {
  typeId: number;
  /** A Mutated module's item id: its own Rolls and MutaMarket estimate. Ignored unless an Abyssal type. */
  itemId?: number;
  itemName: string;
  onClose: () => void;
  /**
   * The location to price at. The Market Browser passes its own effective
   * one (a shared link's hub/region can differ from the saved preference);
   * every other page leaves it out and gets the saved Location Mode and
   * Trade Hub — the same answer the Market Browser and its Compare Drawer
   * give for the item there.
   */
  location?: OrderBookLocation;
  /**
   * An "Open in Market" link in the header, for an Item Detail opened away
   * from the Market Browser (Show info on any page, the Command Palette).
   * Opt-in: on the Market Browser itself it would link to the page already open.
   */
  showOpenInMarket?: boolean;
  /**
   * Set by the URL-backed host (`ItemInfoModal`): a link that leaves the modal
   * replaces its history entry and calls this instead of `onClose`, which would
   * navigate back and race the link.
   */
  onLeave?: () => void;
}

interface DetailData {
  type: TypeDetail;
  /** Skill-requirement rows already excluded — the Required Skills section below owns those instead. */
  groups: AttributeGroup[];
  requiredSkills: RequiredSkill[];
  /** typeID -> name, reused from the same resolution the generic rows already paid for. */
  skillNames: Readonly<Record<number, string>>;
  /** Every skill's name — the popover surfaces skills the item doesn't require, so `skillNames` above isn't enough. */
  allSkillNames: Readonly<Record<number, string>>;
  skillAttributeModifiers: SkillAttributeModifierMap;
  dictionary: AttributeDictionary;
}

/**
 * Distinct from a plain `OrderBookSummary | null`: a region with truly no
 * orders is a valid `'ready'` result (both sides null), which must render
 * differently from `'error'` (the fetch itself failed) — nullability alone
 * can't tell those apart.
 */
type PriceState =
  { status: 'loading' } | { status: 'ready'; summary: OrderBookSummary } | { status: 'error' };

/** Mounted only while open (ImportClipboardDialog's pattern) — mounting is the open signal. */
export function ItemDetailModal({
  typeId,
  itemId,
  itemName,
  onClose,
  location,
  showOpenInMarket = false,
  onLeave,
}: ItemDetailModalProps) {
  const { t } = useTranslation();
  const leave = onLeave ?? onClose;
  const narrow = useIsNarrow();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /**
   * Its own state, not part of `data`. Null when pi.json couldn't be read —
   * the rest of the modal is unaffected.
   */
  const [pi, setPi] = useState<PiData | null>(null);
  const [tab, setTab] = useState<'info' | 'market'>('info');
  const tabsId = useTabsId();
  const [trainedSkills, setTrainedSkills] = useState<ReadonlyMap<number, TrainedSkill>>(new Map());

  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const targetPlan = useTargetPlan(activeCharacterId);

  const savedLocation = useSavedOrderBookLocation(location === undefined);
  const priceLocation = location ?? savedLocation;
  const [priceState, setPriceState] = useState<PriceState>({ status: 'loading' });

  // Null until known, so the market line and link don't flash in on an Abyssal type.
  const abyssal = useIsAbyssalType(typeId);
  const dynamic = useDynamicItem(typeId, abyssal ? itemId : undefined);
  /** The Mutated module's own attributes, grouped as the type's are, for the record they were grouped from. */
  const [dynamicGrouped, setDynamicGrouped] = useState<{
    record: DynamicItemRecord;
    groups: AttributeGroup[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (activeCharacterId === null) {
        if (!cancelled) setTrainedSkills(new Map());
        return;
      }
      // Queue-corrected, like every other trained-level read (usePlanEditorData) —
      // a level the queue just finished but /skills hasn't caught up to would
      // otherwise show wrong here while everywhere else shows it trained.
      const corrected = await loadCorrectedSkills(activeCharacterId, Date.now(), {
        skipQueueWithoutScope: true,
      });
      if (!cancelled) setTrainedSkills(corrected.trained);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  useEffect(() => {
    // No order book for an Abyssal type: skip the fetch.
    if (!priceLocation || abyssal !== false) return;
    let cancelled = false;
    void (async () => {
      setPriceState({ status: 'loading' });
      // Never rejects: a failure is its own status. A nice-to-have fetch, same
      // as the PI schematic below — it costs the price row, never the modal.
      const view = await loadOrderBookView(typeId, priceLocation);
      if (cancelled) return;
      setPriceState(
        view.status === 'failed' ? { status: 'error' } : { status: 'ready', summary: view.summary }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId, priceLocation, abyssal]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setData(null);
      setError(false);
      setPi(null);
      // Off the shared handler and `loading`: only planetary commodities lose
      // anything if it's missing, and it shouldn't hold up the rest.
      void loadPi()
        .catch(() => null)
        .then((loaded) => {
          if (!cancelled) setPi(loaded);
        });
      try {
        const [type, dictionary, skillAttributeModifiers, skills] = await Promise.all([
          loadTypeDetail(typeId),
          loadAttributeDictionary(),
          // Caught here, not by the shared handler below: the
          // attribute-modifier popover is a bonus, not core item detail, so
          // its data failing to load degrades to no popovers rather than
          // blanking the modal.
          loadSkillAttributeModifiers().catch(() => ({})),
          loadSkills().catch(() => []),
        ]);
        if (cancelled) return;
        if (!type) throw new Error(`No type data for ${typeId}`);
        // Needs the dictionary to know which values are ids, so it can't join
        // the fetch above; it never rejects, so it can't blank the modal.
        const names = await loadAttributeReferenceNames([type.dogma_attributes], dictionary);
        if (cancelled) return;
        const allSkillNames: Record<number, string> = {};
        for (const skill of skills) allSkillNames[skill.typeID] = skill.name;
        setData({
          type,
          groups: groupItemAttributes(type.dogma_attributes, dictionary, names, {
            omitSkillRequirementRows: true,
          }),
          requiredSkills: extractRequiredSkills(type.dogma_attributes),
          allSkillNames,
          skillAttributeModifiers,
          skillNames: names.types ?? {},
          dictionary,
        });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  const dynamicRecord = dynamic.status === 'ready' ? dynamic.record : null;
  useEffect(() => {
    if (!data || !dynamicRecord) return;
    let cancelled = false;
    const attributes = recordAttributes(dynamicRecord);
    void loadAttributeReferenceNames([attributes], data.dictionary).then((names) => {
      if (cancelled) return;
      setDynamicGrouped({
        record: dynamicRecord,
        groups: groupItemAttributes(attributes, data.dictionary, names, {
          omitSkillRequirementRows: true,
        }),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [data, dynamicRecord]);
  const attributeGroups =
    (dynamicRecord && dynamicGrouped?.record === dynamicRecord ? dynamicGrouped.groups : null) ??
    data?.groups ??
    [];

  // Gates which attribute-modifier popovers can apply (empty while `data`
  // hasn't loaded yet).
  const requiredSkillTypeIds = new Set((data?.requiredSkills ?? []).map((r) => r.skillTypeID));
  // Implies Open in EVE too: an abyssal type gets neither.
  const showMarketLink = showOpenInMarket && abyssal === false;

  return (
    <Modal
      open
      onClose={onClose}
      // The URL-backed host already owns the history entry (`?info`).
      closeOnBack={onLeave === undefined}
      // An abyssal type's roll table has a column per mutaplasmid, up to eight.
      placement={abyssal || tab === 'market' ? 'wide' : 'center'}
      title={itemName}
      titleActions={
        // Two text buttons squeeze the name to a letter on a phone; there they share one ⋮.
        narrow && showMarketLink ? (
          <ItemDetailMoreActions
            typeId={typeId}
            itemName={itemName}
            onNavigate={leave}
            replace={onLeave !== undefined}
          />
        ) : (
          <>
            {/* An abyssal type has no market group, so no in-game market window either. */}
            {abyssal !== true && (
              <OpenInEveButton kind="marketDetails" id={typeId} name={itemName} />
            )}
            {showMarketLink && (
              <OpenInMarketLink
                typeId={typeId}
                onNavigate={leave}
                replace={onLeave !== undefined}
              />
            )}
          </>
        )
      }
    >
      {loading ? (
        <Spinner block="panel" label={t('common.loading')} />
      ) : error || !data ? (
        <div className="space-y-4">
          <EmptyState
            title={t('market.itemDetail.errorTitle')}
            hint={t('market.itemDetail.errorHint')}
            className="py-8"
          />
          {/* Local SDE data, so they outlive a type-info failure. */}
          <AbyssalItemDetail typeId={typeId} dynamic={dynamic} />
          <PlanetaryProduction pi={pi} typeId={typeId} />
          <MadeFromSection typeId={typeId} />
          <UsedInSection typeId={typeId} onNavigate={leave} />
        </div>
      ) : (
        <div className="space-y-4">
          {abyssal === false && (
            <Tabs
              tabsId={tabsId}
              tabs={[
                { id: 'info', label: t('market.itemDetail.tabInfo') },
                { id: 'market', label: t('market.itemDetail.tabMarket') },
              ]}
              value={tab}
              onChange={(id) => setTab(id as 'info' | 'market')}
              label={t('market.itemDetail.tabsLabel')}
            />
          )}
          {tab === 'market' && abyssal === false ? (
            <TabPanel tabsId={tabsId} tabId="market">
              <ItemMarketTab
                typeId={typeId}
                itemName={itemName}
                initialRegionId={priceLocation?.regionId ?? DEFAULT_TRADE_HUB.regionId}
              />
            </TabPanel>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <TypeIcon
                  typeId={typeId}
                  size={64}
                  width={64}
                  height={64}
                  className="shrink-0 rounded-xs border border-line"
                />
                <div className="space-y-1 text-xs">
                  <p className="text-text-dim">
                    {t('market.itemDetail.volume', { volume: formatVolume(data.type.volume ?? 0) })}
                  </p>
                  {abyssal === null
                    ? null
                    : abyssal
                      ? itemId !== undefined &&
                        activeCharacterId !== null && (
                          <AbyssalEstimateLine
                            typeId={typeId}
                            itemId={itemId}
                            characterId={activeCharacterId}
                          />
                        )
                      : priceState.status !== 'error' && (
                          <p className="flex gap-4 text-text-dim">
                            <PriceFigure
                              label={t('market.itemDetail.bestSell')}
                              side="sell"
                              typeId={typeId}
                              price={
                                priceState.status === 'loading'
                                  ? undefined
                                  : priceState.summary.bestSell
                              }
                              onNavigate={leave}
                              replace={onLeave !== undefined}
                            />
                            <PriceFigure
                              label={t('market.itemDetail.bestBuy')}
                              side="buy"
                              typeId={typeId}
                              price={
                                priceState.status === 'loading'
                                  ? undefined
                                  : priceState.summary.bestBuy
                              }
                              onNavigate={leave}
                              replace={onLeave !== undefined}
                            />
                          </p>
                        )}
                  {data.type.description && (
                    <EveMarkupText markup={data.type.description} className="text-text" />
                  )}
                </div>
              </div>

              <AbyssalItemDetail typeId={typeId} dynamic={dynamic} />

              <RequiredSkillsSection
                requiredSkills={data.requiredSkills}
                skillNames={data.skillNames}
                trainedSkills={trainedSkills}
                target={targetPlan}
                hasCharacter={activeCharacterId !== null}
                itemName={itemName}
              />

              <PlanetaryProduction pi={pi} typeId={typeId} />

              <MadeFromSection typeId={typeId} />

              <UsedInSection typeId={typeId} onNavigate={leave} />

              {attributeGroups.length === 0 ? (
                <p className="text-xs text-text-dim">{t('market.itemDetail.noAttributes')}</p>
              ) : (
                attributeGroups.map((group) => (
                  <div key={group.category}>
                    <h3 className={cx(eyebrowClassName, 'border-b border-line pb-1')}>
                      {group.category}
                    </h3>
                    <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                      {group.attributes.map((attribute) => {
                        const valueText =
                          attribute.displayValue ??
                          `${formatAttributeValue(attribute.value, attribute.unit)}${attribute.unit ? ` ${attribute.unit}` : ''}`;
                        const modifiers = activeCharacterId
                          ? findModifyingSkills(
                              attribute.attributeId,
                              requiredSkillTypeIds,
                              data.skillAttributeModifiers
                            )
                          : [];
                        return (
                          <div key={attribute.attributeId} className="contents">
                            <dt className="text-text-dim">{attribute.name}</dt>
                            <dd className="text-right text-text">
                              {modifiers.length > 0 ? (
                                <AttributeModifierTrigger
                                  modifiers={modifiers}
                                  skillNames={data.allSkillNames}
                                  trainedSkills={trainedSkills}
                                  target={targetPlan}
                                  itemName={itemName}
                                  attributeName={attribute.name}
                                >
                                  {valueText}
                                </AttributeModifierTrigger>
                              ) : (
                                valueText
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * Its own component so the router read happens only when asked for: the
 * Market Browser's modal (and its router-less tests) never render it.
 */
function OpenInMarketLink({
  typeId,
  onNavigate,
  replace,
}: {
  typeId: number;
  onNavigate: () => void;
  replace: boolean;
}) {
  const { t } = useTranslation();
  const { search } = useLocation();
  return (
    <Link
      to={marketItemUrl(typeId, search)}
      replace={replace}
      onClick={onNavigate}
      className={buttonClassName({ size: 'sm' })}
    >
      {t('market.itemDetail.openInMarket')}
    </Link>
  );
}

/**
 * Below `md`, the header's two actions as one ⋮ (DESIGN.md §6c Header
 * controls): Open in EVE, and View in Market doing what
 * `OpenInMarketLink` does.
 */
function ItemDetailMoreActions({
  typeId,
  itemName,
  onNavigate,
  replace,
}: {
  typeId: number;
  itemName: string;
  onNavigate: () => void;
  replace: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const items = (
    <>
      <OpenInEveMenuItem kind="marketDetails" id={typeId} />
      <MenuItem
        onSelect={() => {
          onNavigate();
          void navigate(marketItemUrl(typeId, search), { replace });
        }}
      >
        {t('market.itemDetail.openInMarket')}
      </MenuItem>
    </>
  );
  return (
    <RowActionsContext.Provider value={{ name: itemName, items }}>
      <RowMoreActions />
    </RowActionsContext.Provider>
  );
}

/**
 * One best-price figure. A real price is a link into the Market browser on
 * this item, keeping the page's hub or region (`marketItemUrl`) — the one
 * place in Item Detail where the number itself says "show me the market". It
 * is a figure, not an entity name, so it takes the in-sentence recipe (accent,
 * solid underline; §6c). Without a router (a router-less unit render) or a
 * price it is plain text.
 */
function PriceFigure({
  label,
  side,
  typeId,
  price,
  onNavigate,
  replace,
}: {
  label: string;
  side: 'sell' | 'buy';
  typeId: number;
  /** Undefined while loading; null for a side with no orders. */
  price: number | null | undefined;
  onNavigate: () => void;
  replace: boolean;
}) {
  const inRouter = useInRouterContext();
  const figure = price === undefined ? '…' : priceCell(price);
  return (
    <span>
      {label}{' '}
      {inRouter && price != null ? (
        <PriceLink
          typeId={typeId}
          side={side}
          price={price}
          onNavigate={onNavigate}
          replace={replace}
        />
      ) : (
        <span className="tabular-nums text-text">{figure}</span>
      )}
    </span>
  );
}

function exactPrice(price: number): string {
  return `${formatIsk(price, marketIskDecimals(price))} ISK`;
}

function PriceLink({
  typeId,
  side,
  price,
  onNavigate,
  replace,
}: {
  typeId: number;
  side: 'sell' | 'buy';
  price: number;
  onNavigate: () => void;
  replace: boolean;
}) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const exact = exactPrice(price);
  // The Link itself is the tooltip trigger (one tab stop). The visible figure is
  // the compact text and the accessible name is built from content, so it leads
  // with what is on screen (WCAG 2.5.3).
  return (
    <Tooltip content={t('common.iskExact', { amount: formatIsk(price, marketIskDecimals(price)) })}>
      <Link
        to={marketItemUrl(typeId, search)}
        replace={replace}
        onClick={onNavigate}
        className={cx(inlineLinkClassName, 'cursor-help tabular-nums')}
      >
        {formatIskCompact(price)}{' '}
        <span className="sr-only">
          {side === 'sell'
            ? t('market.itemDetail.bestSellOpen', { price: exact })
            : t('market.itemDetail.bestBuyOpen', { price: exact })}
        </span>
      </Link>
    </Tooltip>
  );
}

/**
 * A side of the order book with no orders renders as '—', matching
 * CompareDrawer/VariationsTable — and so does the shorthand a real price gets,
 * so the same figure reads the same way wherever the Market area shows it.
 * The line is inert, so a tap is free to be the reveal.
 */
function priceCell(price: number | null): ReactNode {
  return price != null ? <IskAmount value={price} decimals={marketIskDecimals(price)} /> : '—';
}

/**
 * "Which skill changes this?" — wraps an attribute's displayed value in a
 * click-to-reveal popover. `modifiers` is already resolved
 * (`findModifyingSkills`) to the skills that actually apply to this item,
 * each already carrying its own per-level value — no fetch needed to render.
 */
function AttributeModifierTrigger({
  modifiers,
  skillNames,
  trainedSkills,
  target,
  itemName,
  attributeName,
  children,
}: {
  modifiers: readonly ModifyingSkillEffect[];
  skillNames: Readonly<Record<number, string>>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  target: TargetPlan;
  itemName: string;
  attributeName: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const modifiersLabel = t('market.itemDetail.modifiersFor', { attribute: attributeName });
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cx(
            fieldBaseClassName,
            'inline-flex items-center gap-1 px-1.5 py-0.5 text-xs',
            interactiveClassName,
            focusRingClassName
          )}
        >
          {children}
          <span className="sr-only">{modifiersLabel}</span>
          <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2" aria-label={modifiersLabel}>
        {modifiers.map((modifier) => (
          <AttributeModifierRow
            key={modifier.ownerSkillTypeID}
            modifier={modifier}
            skillName={skillNameOrFallback(modifier.ownerSkillTypeID, skillNames)}
            trainedLevel={trainedSkills.get(modifier.ownerSkillTypeID)?.level ?? 0}
            target={target}
            itemName={itemName}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** One skill's effect inside `AttributeModifierTrigger`'s popover — `modifier.perLevelValue` is already static SDE data, no fetch needed. */
function AttributeModifierRow({
  modifier,
  skillName,
  trainedLevel,
  target,
  itemName,
}: {
  modifier: ModifyingSkillEffect;
  skillName: string;
  trainedLevel: number;
  target: TargetPlan;
  itemName: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-xs">
      <p className="text-text">
        {t('skills.attributeModifier.perLevel', {
          skill: skillName,
          perLevel: modifier.perLevelValue,
        })}
      </p>
      <p className="text-text-dim">
        {trainedLevel > 0
          ? t('skills.attributeModifier.current', {
              level: trainedLevel,
              total: postPercentMagnitude(modifier.perLevelValue, trainedLevel),
            })
          : t('skills.attributeModifier.untrained')}
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          void target.addEntries(
            [
              {
                skillTypeID: modifier.ownerSkillTypeID,
                targetLevel: Math.min(trainedLevel + 1, 5),
              },
            ],
            itemName
          )
        }
      >
        {target.plans?.length === 0
          ? t('skills.fitCheck.createPlanAndAdd')
          : t('skills.requiredSkills.addToPlan')}
      </Button>
    </div>
  );
}

/**
 * How a planetary commodity is produced: the schematic's inputs, its cycle
 * time and what one cycle yields. A P0 resource has no schematic — an
 * extractor pulls it off the planet — so it gets the one line that says so,
 * and everything else in New Eden renders nothing here.
 */
function PlanetaryProduction({ pi, typeId }: { pi: PiData | null; typeId: number }) {
  const { t } = useTranslation();
  if (!pi) return null;
  const schematic = pi.schematics[String(typeId)];
  const raw = pi.raw.some((resource) => resource.typeID === typeId);
  if (!schematic && !raw) return null;
  return (
    <div>
      <h3 className={cx(eyebrowClassName, 'border-b border-line pb-1')}>
        {t('market.itemDetail.planetaryTitle')}
      </h3>
      {schematic ? (
        <>
          <p className="mt-1 text-xs text-text-dim">
            {t('market.itemDetail.planetaryCycle', {
              quantity: formatCount(schematic.quantity),
              duration: formatDuration(schematic.cycleTime),
            })}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-text">
            {schematic.inputs.map((input) => (
              <li key={input.typeID}>
                {t('market.itemDetail.planetaryInput', {
                  quantity: formatCount(input.quantity),
                  name: input.name,
                })}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-xs text-text-dim">{t('market.itemDetail.planetaryRaw')}</p>
      )}
    </div>
  );
}
