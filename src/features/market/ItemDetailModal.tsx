import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useInRouterContext, useLocation } from 'react-router-dom';
import {
  Button,
  buttonClassName,
  EmptyState,
  IskAmount,
  Modal,
  Spinner,
  TabPanel,
  Tabs,
  Tooltip,
  TypeIcon,
  useTabsId,
} from '@/components/ui';
import { DEFAULT_TRADE_HUB, TRADE_HUBS } from '@/market/hubs';
import type { AttributeDictionary, AttributeReferenceNames } from '@/engine/market/itemAttributes';
import {
  itemAttributeSections,
  itemKindOf,
  withSkilledValues,
  type AttributeSection,
  type ItemKind,
} from '@/engine/market/itemAttributeSections';
import { marketItemUrl } from '@/engine/market/urlState';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import {
  findModifyingSkills,
  nextLevelValues,
  postPercentMagnitude,
  type ModifyingSkillEffect,
} from '@/engine/market/skillAttributeEffects';
import type { TrainedSkill } from '@/engine/types';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadPi, loadSkillAttributeModifiers, loadSkills } from '@/sde/loadSde';
import type { PiData, SkillAttributeModifierMap } from '@/sde/types';
import { formatDuration } from '@/lib/duration';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { NO_TRAINED_SKILLS } from './useOrderRowSkills';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { extractRequiredSkills, type RequiredSkill } from '@/features/skills/dogma';
import { useTargetPlan, type TargetPlan } from '@/features/skills/useTargetPlan';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { loadRegionName } from '@/features/places/regions';
import { loadAttributeReferenceNames } from './attributeReferenceNames';
import { formatVolume } from './format';
import { romanLevel } from '@/engine/projection';
import { ItemAttributeSections } from './ItemAttributeSections';
import { numberText, sectionsShowSkilled } from './skilledFigures';
import { SkilledValuesNote } from './SkilledValuesNote';
import { useSkilledAttributes } from '@/features/fittings/useSkilledAttributes';
import { loadTypeDetail, type TypeDetail } from '@/features/skills/typeDetail';
import {
  loadOrderBookView,
  useSavedOrderBookLocation,
  type OrderBookLocation,
} from './orderBookView';
import { ItemMarketTab } from './ItemMarketTab';
import { ItemDescription } from './ItemDescription';
import { loadItemGroupLine } from './itemGroupLine';
import { loadItemCategoryId } from './itemCategory';
import { IMPLANT_CATEGORY_ID } from '@/sde/categories';
import { priceMarketOf } from './priceMarket';
import { RequiredSkillsSection } from './RequiredSkillsSection';
import { skillNameOrFallback } from './skillNameOrFallback';
import { MadeFromSection } from './MadeFromSection';
import { UsedInSection } from './UsedInSection';
import { AbyssalItemDetail } from '@/features/abyssal/AbyssalItemDetail';
import { AbyssalEstimateLine } from '@/features/abyssal/AbyssalEstimateLine';
import { useIsAbyssalType } from '@/features/abyssal/mutaplasmidData';
import { useDynamicItem, useDynamicItemMutation } from '@/features/abyssal/useDynamicItem';
import { recordAttributes } from '@/features/abyssal/dynamicItems';
import type { DynamicItemRecord } from '@/db';
import { formatIsk, formatIskCompact, marketIskDecimals } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';
import { assetHref } from '@/features/assets/assetBrowseModel';
import { useOwnedAssetIndex } from '@/features/assets/useOwnedAssetIndex';

export interface ItemDetailModalProps {
  typeId: number;
  itemId?: number;
  itemName: string;
  onClose: () => void;
  location?: OrderBookLocation;
  showOpenInMarket?: boolean;
  onLeave?: () => void;
}

interface DetailData {
  type: TypeDetail;
  sections: AttributeSection[];
  kind: ItemKind;
  requiredSkills: RequiredSkill[];
  skillNames: Readonly<Record<number, string>>;
  allSkillNames: Readonly<Record<number, string>>;
  skillAttributeModifiers: SkillAttributeModifierMap;
  dictionary: AttributeDictionary;
}

type PriceState =
  { status: 'loading' } | { status: 'ready'; summary: OrderBookSummary } | { status: 'error' };

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
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pi, setPi] = useState<PiData | null>(null);
  const [tab, setTab] = useState<'info' | 'market'>('info');
  const tabsId = useTabsId();

  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const targetPlan = useTargetPlan(activeCharacterId);

  const savedLocation = useSavedOrderBookLocation(location === undefined);
  const priceLocation = location ?? savedLocation;
  const [priceState, setPriceState] = useState<PriceState>({ status: 'loading' });
  const priceMarket = priceLocation ? priceMarketOf(typeId, priceLocation) : null;
  const regionToLookUp =
    priceMarket?.kind === 'region' && priceMarket.name === null ? priceMarket.regionId : null;
  const loadPriceRegionName = useCallback(
    () => (regionToLookUp === null ? Promise.resolve(null) : loadRegionName(regionToLookUp)),
    [regionToLookUp]
  );
  const { data: lookedUpRegionName } = useKeyedLoad(
    regionToLookUp === null ? null : String(regionToLookUp),
    loadPriceRegionName
  );
  const priceMarketName = priceMarket?.name ?? lookedUpRegionName ?? null;
  const inputPriceHub = priceLocation
    ? (TRADE_HUBS.find((hub) => hub.stationId === priceLocation.hubStationId) ?? DEFAULT_TRADE_HUB)
    : null;
  const loadGroupLine = useCallback(() => loadItemGroupLine(typeId), [typeId]);
  const { data: groupLine } = useKeyedLoad(String(typeId), loadGroupLine);
  const loadCategory = useCallback(() => loadItemCategoryId(typeId), [typeId]);
  const category = useKeyedLoad(String(typeId), loadCategory);

  const abyssal = useIsAbyssalType(typeId);
  const dynamic = useDynamicItem(typeId, abyssal ? itemId : undefined);
  const [dynamicNames, setDynamicNames] = useState<{
    record: DynamicItemRecord;
    names: AttributeReferenceNames;
  } | null>(null);
  const mutation = useDynamicItemMutation(typeId, dynamic);
  const skilled = useSkilledAttributes(typeId, mutation ?? undefined);

  const loadTrainedSkills = useCallback(
    () =>
      loadCorrectedSkills(activeCharacterId ?? 0, Date.now(), {
        skipQueueWithoutScope: true,
      }).then((corrected) => corrected.trained),
    [activeCharacterId]
  );
  const trainedSkills: ReadonlyMap<number, TrainedSkill> =
    useKeyedLoad(activeCharacterId === null ? null : String(activeCharacterId), loadTrainedSkills)
      .data ?? NO_TRAINED_SKILLS;

  useEffect(() => {
    if (!priceLocation || abyssal !== false) return;
    let cancelled = false;
    void (async () => {
      setPriceState({ status: 'loading' });
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
      void loadPi()
        .catch(() => null)
        .then((loaded) => {
          if (!cancelled) setPi(loaded);
        });
      try {
        const [type, dictionary, skillAttributeModifiers, skills] = await Promise.all([
          loadTypeDetail(typeId),
          loadAttributeDictionary(),
          loadSkillAttributeModifiers().catch(() => ({})),
          loadSkills().catch(() => []),
        ]);
        if (cancelled) return;
        if (!type) throw new Error(`No type data for ${typeId}`);
        const names = await loadAttributeReferenceNames([type.dogma_attributes], dictionary);
        if (cancelled) return;
        const allSkillNames: Record<number, string> = {};
        for (const skill of skills) allSkillNames[skill.typeID] = skill.name;
        const kind = itemKindOf(type.dogma_attributes, type.dogma_effects);
        setData({
          type,
          kind,
          sections: itemAttributeSections(type.dogma_attributes, dictionary, names, {
            kind,
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
      if (!cancelled) setDynamicNames({ record: dynamicRecord, names });
    });
    return () => {
      cancelled = true;
    };
  }, [data, dynamicRecord]);
  const baseSections = useMemo(() => {
    if (!data) return [];
    if (!dynamicRecord || dynamicNames?.record !== dynamicRecord) return data.sections;
    return itemAttributeSections(
      recordAttributes(dynamicRecord),
      data.dictionary,
      dynamicNames.names,
      {
        kind: data.kind,
        omitSkillRequirementRows: true,
        omitAttributeIds: mutation
          ? new Set(Object.keys(mutation.attributes).map(Number))
          : undefined,
      }
    );
  }, [data, dynamicRecord, dynamicNames, mutation]);
  const attributeSections = useMemo(
    () =>
      skilled.status === 'ready' ? withSkilledValues(baseSections, skilled.values) : baseSections,
    [baseSections, skilled]
  );
  const modifiersOf = (attributeId: number) =>
    activeCharacterId && data
      ? findModifyingSkills(attributeId, requiredSkillTypeIds, data.skillAttributeModifiers)
      : [];

  const requiredSkillTypeIds = new Set((data?.requiredSkills ?? []).map((r) => r.skillTypeID));
  const showMarketLink = showOpenInMarket && abyssal === false;

  return (
    <Modal
      open
      onClose={onClose}
      closeOnBack={onLeave === undefined}
      placement="detail"
      title={
        <span className="text-sm font-semibold tracking-normal text-text normal-case">
          {itemName}
        </span>
      }
      titleActions={
        abyssal !== true && <OpenInEveButton kind="marketDetails" id={typeId} name={itemName} />
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
          <AbyssalItemDetail
            typeId={typeId}
            dynamic={dynamic}
            skilled={skilled.status === 'ready' ? skilled : undefined}
          />
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
              {showMarketLink && (
                <div className="mb-2 flex justify-end">
                  <OpenInMarketLink
                    typeId={typeId}
                    onNavigate={leave}
                    replace={onLeave !== undefined}
                  />
                </div>
              )}
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
                <div className="min-w-0 space-y-1 text-xs">
                  {groupLine && (
                    <p className="text-sm text-text">
                      {groupLine.faction
                        ? t('market.itemDetail.groupWithFaction', {
                            group: groupLine.group,
                            faction: groupLine.faction,
                          })
                        : groupLine.group}
                    </p>
                  )}
                  <VolumeLine type={data.type} />
                  <FindInAssetsLink
                    typeId={typeId}
                    itemName={itemName}
                    onNavigate={leave}
                    replace={onLeave !== undefined}
                  />
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
                          <p className="flex flex-wrap gap-x-4 text-text-dim">
                            {priceMarket && priceMarketName && (
                              <span className="text-text">
                                {t(
                                  priceMarket.kind === 'hub'
                                    ? 'market.itemDetail.pricesAtHub'
                                    : 'market.itemDetail.pricesInRegion',
                                  { market: priceMarketName }
                                )}
                              </span>
                            )}
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
                </div>
              </div>

              {data.type.description && category.status === 'ready' && (
                <ItemDescription
                  markup={data.type.description}
                  full={category.data === IMPLANT_CATEGORY_ID}
                />
              )}

              <AbyssalItemDetail
                typeId={typeId}
                dynamic={dynamic}
                skilled={skilled.status === 'ready' ? skilled : undefined}
              />

              <RequiredSkillsSection
                requiredSkills={data.requiredSkills}
                skillNames={data.skillNames}
                trainedSkills={trainedSkills}
                target={targetPlan}
                hasCharacter={activeCharacterId !== null}
                itemName={itemName}
              />

              <PlanetaryProduction pi={pi} typeId={typeId} />

              <MadeFromSection
                typeId={typeId}
                pricing={
                  inputPriceHub && abyssal === false
                    ? {
                        hub: inputPriceHub,
                        bestSell:
                          priceState.status === 'ready' ? priceState.summary.bestSell : undefined,
                      }
                    : undefined
                }
              />

              <UsedInSection typeId={typeId} onNavigate={leave} />

              {attributeSections.length > 0 && (
                <SkilledValuesNote
                  state={skilled}
                  changed={sectionsShowSkilled(attributeSections)}
                  key={typeId}
                />
              )}

              {attributeSections.length === 0 ? (
                !mutation && (
                  <p className="text-xs text-text-dim">{t('market.itemDetail.noAttributes')}</p>
                )
              ) : (
                <ItemAttributeSections
                  sections={attributeSections}
                  skilledSources={skilled.status === 'ready' ? skilled.sources : undefined}
                  renderSkillList={(attribute) => {
                    const modifiers = modifiersOf(attribute.attributeId);
                    return modifiers.length > 0 ? (
                      <AttributeModifierList
                        modifiers={modifiers}
                        skillNames={data.allSkillNames}
                        trainedSkills={trainedSkills}
                        target={targetPlan}
                        itemName={itemName}
                        figure={
                          attribute.displayValue === undefined
                            ? {
                                value: attribute.skilledValue ?? attribute.value,
                                unit: attribute.unit,
                                skillsApplied: attribute.skilledValue !== undefined,
                              }
                            : null
                        }
                      />
                    ) : null;
                  }}
                />
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

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

function FindInAssetsLink({
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
  const inRouter = useInRouterContext();
  const signedIn = useActiveCharacter((state) => state.activeCharacterId !== null);
  const owned = useOwnedAssetIndex(inRouter && signedIn);
  if (owned?.typeIds.has(typeId) !== true) return null;
  return (
    <p>
      <Link
        to={assetHref(null, [], `?chars=all&q=${encodeURIComponent(itemName)}`)}
        replace={replace}
        onClick={onNavigate}
        className={inlineLinkClassName}
      >
        {t('market.itemDetail.findInAssets')}
      </Link>
    </p>
  );
}

function VolumeLine({ type }: { type: TypeDetail }) {
  const { t } = useTranslation();
  const volume = type.volume ?? 0;
  const packaged = type.packaged_volume;
  if (packaged === undefined || packaged === volume) {
    return (
      <p className="text-text-dim">
        {t('market.itemDetail.volume', { volume: formatVolume(volume) })}
      </p>
    );
  }
  return (
    <p className="text-text-dim">
      {t('market.itemDetail.volumePackaged', { volume: formatVolume(packaged) })}{' '}
      {t('market.itemDetail.volumeAssembled', { volume: formatVolume(volume) })}
    </p>
  );
}

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

function priceCell(price: number | null): ReactNode {
  return price != null ? <IskAmount value={price} decimals={marketIskDecimals(price)} /> : '—';
}

function AttributeModifierList({
  modifiers,
  skillNames,
  trainedSkills,
  target,
  itemName,
  figure,
}: {
  modifiers: readonly ModifyingSkillEffect[];
  skillNames: Readonly<Record<number, string>>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  target: TargetPlan;
  itemName: string;
  figure: AttributeFigure | null;
}) {
  return modifiers.map((modifier) => (
    <AttributeModifierRow
      key={modifier.ownerSkillTypeID}
      modifier={modifier}
      skillName={skillNameOrFallback(modifier.ownerSkillTypeID, skillNames)}
      trainedLevel={trainedSkills.get(modifier.ownerSkillTypeID)?.level ?? 0}
      target={target}
      itemName={itemName}
      figure={figure}
    />
  ));
}

interface AttributeFigure {
  value: number;
  unit: string | null;
  skillsApplied: boolean;
}

const NEXT_LEVELS_SHOWN = 3;

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function AttributeModifierRow({
  modifier,
  skillName,
  trainedLevel,
  target,
  itemName,
  figure,
}: {
  modifier: ModifyingSkillEffect;
  skillName: string;
  trainedLevel: number;
  target: TargetPlan;
  itemName: string;
  figure: AttributeFigure | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-xs">
      <p className="text-text">
        {t('skills.attributeModifier.perLevel', {
          skill: skillName,
          perLevel: signed(modifier.perLevelValue),
        })}
      </p>
      <p className="text-text-dim">
        {trainedLevel > 0
          ? t('skills.attributeModifier.current', {
              level: trainedLevel,
              total: signed(postPercentMagnitude(modifier.perLevelValue, trainedLevel)),
            })
          : t('skills.attributeModifier.untrained')}
      </p>
      {figure &&
        nextLevelValues(
          figure.value,
          modifier.perLevelValue,
          trainedLevel,
          NEXT_LEVELS_SHOWN,
          figure.skillsApplied ? trainedLevel : 0
        ).map((next) => (
          <p key={next.level} className="tabular-nums text-text-dim">
            {t('skills.attributeModifier.nextLevel', {
              level: romanLevel(next.level),
              value: numberText(next.value, figure.unit),
            })}
          </p>
        ))}
      {trainedLevel < 5 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void target.addEntries(
              [{ skillTypeID: modifier.ownerSkillTypeID, targetLevel: trainedLevel + 1 }],
              itemName
            )
          }
        >
          {target.plans?.length === 0
            ? t('skills.fitCheck.createPlanAndAdd')
            : t('skills.requiredSkills.addToPlan')}
        </Button>
      )}
    </div>
  );
}

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
