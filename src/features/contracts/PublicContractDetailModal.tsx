import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  LoadFailedState,
  RowMoreActions,
  SlideOver,
  Spinner,
  StatChip,
  StatChips,
  TypeIcon,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { loadContractLocationName } from '@/features/character/contractLocationName';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  loadPublicContractItems,
  type PublicContractItemsOutcome,
} from '@/features/bpcContracts/publicContractItems';
import { PlaceLink, SystemLink } from '@/features/entities';
import { ItemInfoLink } from '@/features/entities';
import { usePlexPrice } from '@/features/market/plexPrice';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import {
  BUNDLE_MINORITY_SHARE,
  bundleShareOfValue,
  type ContractFlag,
} from '@/engine/contracts/contractFlags';
import { flagDetail } from '@/features/contractSearch/contractFlagText';
import * as Icon from '@/components/ui/icons';
import { SIMILAR_COPY_WINDOW, type BpcPerRunCheck } from '@/engine/contracts/bpcPerRunCheck';
import { useHubFor } from '@/features/market/hub';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { ContractAbyssalValue } from './ContractAbyssalValue';
import { loadAbyssalContractValue, type AbyssalContractValue } from './abyssalValueMath';
import type { PriceSide } from '@/engine/miningTax/priceBasis';
import { ContractPriceCheck, type PriceCheckRowModel } from './ContractPriceCheck';
import { CopyContractIdButton } from './CopyContractIdButton';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { formatSignedPercent, percentDirection, savingTone } from '@/lib/formatSignedPercent';
import { formatContractIsk } from '@/lib/isk';
import { useContractPriceCheck } from './useContractPriceCheck';
import {
  mergeContractItemLines,
  planSeedForLine,
  type ContractItemLine,
} from './contractItemLines';

export interface PublicContractDetailModalStatChip {
  label: string;
  value: string;
}

export interface PublicContractDetailModalProps {
  title: string;
  characterId: number;
  contractId: number;
  locationId: number;
  regionName: string;
  system?: { id: number; name: string } | null;
  dateExpired: number;
  statChips: readonly PublicContractDetailModalStatChip[];
  askingIsk?: number | null;
  searchedTypeIds?: ReadonlySet<number> | null;
  bpcCheck?: BpcPerRunCheck | null;
  flag?: ContractFlag | null;
  flagMultiple?: number;
  defaultPriceSide?: PriceSide;
  otherValue?: { value: number; lines: number } | null;
  onClose: () => void;
}

interface ItemsState {
  outcome: PublicContractItemsOutcome;
  typeNames: Map<number, string>;
}

const LIVE = { kind: 'live' } as const;

export function PublicContractDetailModal({
  title,
  characterId,
  contractId,
  locationId,
  regionName,
  system,
  dateExpired,
  statChips,
  askingIsk = null,
  searchedTypeIds = null,
  bpcCheck,
  flag = null,
  flagMultiple,
  defaultPriceSide = 'sell',
  otherValue,
  onClose,
}: PublicContractDetailModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { hubId } = useHubFor('contracts');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const isAbyssalType = useMutaplasmidLookup()?.isAbyssalType;
  const [location, setLocation] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<ItemsState | null | undefined>(undefined);
  const [abyssalValue, setAbyssalValue] = useState<AbyssalContractValue | undefined>(undefined);
  const [abyssalOnlyFor, setAbyssalOnlyFor] = useState<number | null>(null);
  const abyssalOnly = abyssalOnlyFor === contractId;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLocation(undefined);
      const name = await loadContractLocationName(characterId, locationId);
      if (!cancelled) setLocation(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, locationId]);

  const [itemsAttempt, setItemsAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setItems(undefined);
      const result = await loadPublicContractItems(contractId);
      if (cancelled) return;
      if (!result?.data) {
        setItems(null);
        return;
      }
      const outcome = result.data;
      const typeNames =
        outcome.kind === 'items'
          ? await loadTypeNames(outcome.items.map((item) => item.type_id))
          : new Map<number, string>();
      if (!cancelled) setItems({ outcome, typeNames });
    })();
    return () => {
      cancelled = true;
    };
  }, [contractId, itemsAttempt]);

  const lines = useMemo(
    () =>
      items && items.outcome.kind === 'items'
        ? mergeContractItemLines(items.outcome.items, isAbyssalType)
        : [],
    [items, isAbyssalType]
  );
  const included = lines.filter((line) => line.isIncluded);
  const requested = lines.filter((line) => !line.isIncluded);
  const shownLines = abyssalOnly ? lines.filter((line) => isAbyssalType?.(line.typeId)) : lines;
  const shownIncluded = shownLines.filter((line) => line.isIncluded);
  const shownRequested = shownLines.filter((line) => !line.isIncluded);

  const anySearched = searchedTypeIds !== null && lines.some((l) => searchedTypeIds.has(l.typeId));
  const searchedMark = (line: ContractItemLine): boolean | undefined =>
    anySearched ? searchedTypeIds!.has(line.typeId) : undefined;

  const hasPlex = lines.some((line) => line.typeId === PLEX_TYPE_ID);
  const plexPrice = usePlexPrice(hasPlex);
  const sellOverrides = useMemo(
    () => (plexPrice === null ? undefined : new Map([[PLEX_TYPE_ID, plexPrice]])),
    [plexPrice]
  );
  const checkLines = useMemo(() => {
    const abyssal = (line: ContractItemLine) => isAbyssalType?.(line.typeId) ?? false;
    const toLine = (line: ContractItemLine) => ({
      typeId: line.typeId,
      quantity: line.quantity,
      ...(line.isBlueprintCopy ? { unpriceable: true as const } : {}),
    });
    return {
      included: lines.filter((l) => l.isIncluded && !abyssal(l)).map(toLine),
      requested: lines.filter((l) => !l.isIncluded && !abyssal(l)).map(toLine),
      abyssal: lines
        .filter(abyssal)
        .map((line) => ({ type_id: line.typeId, item_id: line.itemId })),
    };
  }, [lines, isAbyssalType]);
  const priceCheck = useContractPriceCheck({
    identity: String(contractId),
    enabled:
      bpcCheck === undefined &&
      [...checkLines.included, ...checkLines.requested].some((line) => !line.unpriceable) &&
      included.length > 0 &&
      (requested.length > 0 || (askingIsk ?? 0) > 0),
    included: checkLines.included,
    requested: checkLines.requested,
    asking: askingIsk ?? 0,
    basis: LIVE,
    hub,
    hubArea: 'contracts',
    defaultSide: defaultPriceSide,
    sellOverrides,
    otherValue,
    searchedTypeIds: anySearched ? searchedTypeIds : null,
    asBuyer: true,
  });

  const flagNotes = useMemo(() => {
    const notes: string[] = [];
    if (flag) notes.push(flagDetail(flag, hub, t));
    if (flag?.kind === 'overpriced' && flagMultiple !== undefined) {
      notes.push(t('contractDetail.flagThreshold', { times: flagMultiple }));
    }
    const split = priceCheck?.split;
    const share = split ? bundleShareOfValue(split) : null;
    if (split && share === null && split.unpricedLines > 0 && split.restLines > 0) {
      notes.push(
        t('contractDetail.flagBundleUnpriced', { hub: hub.systemName, count: split.restLines })
      );
    }
    if (split && share !== null && share < BUNDLE_MINORITY_SHARE) {
      const percent = Math.round(share * 100);
      notes.push(
        t(
          percent < 1 ? 'contractDetail.flagBundleShareUnderOne' : 'contractDetail.flagBundleShare',
          {
            share: `${percent}%`,
            hub: hub.systemName,
            side: t(
              split.side === 'buy' ? 'contractDetail.flagSideBuy' : 'contractDetail.flagSideSell'
            ),
            count: split.restLines,
          }
        )
      );
    }
    return notes;
  }, [flag, flagMultiple, priceCheck, hub, t]);

  useEffect(() => {
    if (checkLines.abyssal.length === 0) return;
    let cancelled = false;
    void loadAbyssalContractValue(checkLines.abyssal, {
      characterId,
      isCancelled: () => cancelled,
    }).then((value) => {
      if (!cancelled) setAbyssalValue(value);
    });
    return () => {
      cancelled = true;
    };
  }, [checkLines.abyssal, characterId]);

  const twoSided = included.length > 0 && requested.length > 0;
  const oneSidedHeading =
    requested.length > 0 && included.length === 0
      ? t('contractDetail.youHandOverHeading')
      : t('contractDetail.contentsHeading');

  return (
    <SlideOver
      open
      onClose={onClose}
      contentKey={contractId}
      maxWidthClassName="max-w-[28rem]"
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {title}
          <Pill>{t('contractDetail.publicLabel')}</Pill>
        </span>
      }
      subtitle={
        <span className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="tabular-nums">{contractId}</span>
          <CopyContractIdButton contractId={contractId} />
          <OpenInEveButton
            kind="contract"
            id={contractId}
            name={t('contractDetail.openInEveName', { id: contractId })}
          />
        </span>
      }
    >
      <div className="flex flex-col gap-5 text-xs">
        <StatChips>
          {statChips.map((chip, index) => (
            <StatChip
              key={chip.label}
              emphasis={index === 0}
              label={chip.label}
              value={chip.value}
            />
          ))}
          <StatChip
            label={t('contractDetail.expiresLabel')}
            value={formatTimestamp(new Date(dateExpired), timeZone)}
          />
        </StatChips>

        {items === undefined ? (
          <Spinner />
        ) : items === null ? (
          <LoadFailedState
            title={t('common.loadFailed.publicContract')}
            onRetry={() => setItemsAttempt((n) => n + 1)}
          />
        ) : items.outcome.kind === 'not-found' ? (
          <EmptyState
            title={t('contractDetail.noLongerListedTitle')}
            hint={t('contractDetail.noLongerListedHint')}
          />
        ) : lines.length === 0 ? (
          <EmptyState title={t('contracts.detailNoItems')} className="py-4" />
        ) : twoSided ? (
          <>
            <ItemGroup
              key={`${contractId}-hand`}
              heading={t('contractDetail.youHandOverHeading')}
              lines={shownRequested}
              typeNames={items.typeNames}
              searched={searchedMark}
            />
            <ItemGroup
              key={`${contractId}-receive`}
              heading={t('contractDetail.youReceiveHeading')}
              lines={shownIncluded}
              typeNames={items.typeNames}
              searched={searchedMark}
            />
          </>
        ) : (
          <ItemGroup
            key={`${contractId}-all`}
            heading={oneSidedHeading}
            lines={shownLines}
            typeNames={items.typeNames}
            searched={searchedMark}
          />
        )}

        {bpcCheck !== undefined && <BpcPriceCheck check={bpcCheck} />}
        {priceCheck && <ContractPriceCheck {...priceCheck} />}
        {flagNotes.length > 0 && (
          <p className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 shrink-0 text-warning">
              <Icon.Warn aria-hidden size={Icon.ICON_SIZE.sm} />
            </span>
            <span>
              {flagNotes[0]}
              {flagNotes.slice(1).map((note) => (
                <span key={note} className="block text-text-dim">
                  {note}
                </span>
              ))}
            </span>
          </p>
        )}
        {abyssalValue && checkLines.abyssal.length > 0 && (
          <ContractAbyssalValue
            value={abyssalValue}
            abyssalOnly={abyssalOnly}
            onToggleAbyssalOnly={() => setAbyssalOnlyFor(abyssalOnly ? null : contractId)}
          />
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-text-dim">{t('contractDetail.regionLabel')}</dt>
          <dd className="break-words">{regionName}</dd>
          {system && (
            <>
              <dt className="text-text-dim">{t('contractDetail.systemLabel')}</dt>
              <dd className="break-words">
                <SystemLink systemId={system.id}>{system.name}</SystemLink>
              </dd>
            </>
          )}
          <dt className="text-text-dim">{t('contractDetail.locationLabel')}</dt>
          <dd className="break-words">
            {location === undefined ? (
              <Spinner />
            ) : location === null ? (
              t('contractDetail.unknownLocation', { id: locationId })
            ) : (
              <PlaceLink id={locationId}>{location}</PlaceLink>
            )}
          </dd>
        </dl>
      </div>
    </SlideOver>
  );
}

function BpcPriceCheck({ check }: { check: BpcPerRunCheck | null }) {
  const { t } = useTranslation();
  if (check === null) {
    return (
      <ContractPriceCheck
        heading={t('contractDetail.priceCheckHeadingBpcNone')}
        rows={[]}
        message={t('contractDetail.priceCheckNoSimilar')}
      />
    );
  }
  const rows: PriceCheckRowModel[] = [
    { label: t('contractDetail.priceCheckBpcThis'), value: formatContractIsk(check.perRun) },
    {
      label: t('contractDetail.priceCheckBpcMedian'),
      value: formatContractIsk(check.medianPerRun),
      note: t('contractDetail.priceCheckBpcMedianNote', SIMILAR_COPY_WINDOW),
    },
    {
      label: t('contractDetail.priceCheckBpcCheapest'),
      value: formatContractIsk(check.cheapestPerRun),
    },
  ];
  if (check.diff !== null) {
    const saving = -check.diff;
    const direction = percentDirection(saving);
    rows.push({
      label: t('contractDetail.priceCheckSaving'),
      value: formatSignedPercent(saving),
      tone: savingTone(saving),
      note: t(
        direction === 'above'
          ? 'contractDetail.priceCheckBpcBelow'
          : direction === 'below'
            ? 'contractDetail.priceCheckBpcAbove'
            : 'contractDetail.priceCheckBpcLevel'
      ),
    });
  }
  return (
    <ContractPriceCheck
      heading={t('contractDetail.priceCheckHeadingBpc', { count: check.count })}
      rows={rows}
    />
  );
}

const ITEM_CAP = 10;
const ITEM_NO_CAP_MAX = 12;

function ItemGroup({
  heading,
  lines,
  typeNames,
  searched,
}: {
  heading: string;
  lines: ContractItemLine[];
  typeNames: ReadonlyMap<number, string>;
  searched: (line: ContractItemLine) => boolean | undefined;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const capped = lines.length > ITEM_NO_CAP_MAX;
  const matches = lines.filter((line) => searched(line) === true);
  const ordered =
    matches.length > 0 ? [...matches, ...lines.filter((line) => searched(line) !== true)] : lines;
  const shown =
    capped && !expanded ? ordered.slice(0, Math.max(ITEM_CAP, matches.length)) : ordered;
  const hidden = ordered.length - shown.length;
  if (lines.length === 0) return null;
  return (
    <div>
      <h3 className={cx(eyebrowClassName, 'flex items-center gap-1.5 pb-1.5')}>{heading}</h3>
      <ul id={listId} className="flex flex-col gap-1">
        {shown.map((line) => (
          <ContractItemRow
            key={line.key}
            line={line}
            name={typeNames.get(line.typeId) ?? `#${line.typeId}`}
            searched={searched(line)}
          />
        ))}
      </ul>
      {capped && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 w-full"
        >
          {expanded
            ? t('contractDetail.showFewerItems')
            : t('contractDetail.showMoreItems', { count: hidden })}
        </Button>
      )}
    </div>
  );
}

function ContractItemRow({
  line,
  name,
  searched,
}: {
  line: ContractItemLine;
  name: string;
  searched: boolean | undefined;
}) {
  const { t } = useTranslation();
  return (
    <BuildPlanContextMenu
      typeId={line.typeId}
      itemName={name}
      seed={planSeedForLine(line)}
      trigger={
        <li
          className={cx(
            'flex items-center gap-2 rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-sm hover:border-line-bright',
            searched === false && 'text-text-dim'
          )}
        >
          <TypeIcon
            typeId={line.typeId}
            size={32}
            width={24}
            height={24}
            className="shrink-0 rounded-xs border border-line"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-0 truncate">
                <ItemInfoLink typeId={line.typeId} itemId={line.itemId}>
                  {name}
                </ItemInfoLink>
              </span>
              {searched === true && (
                <Pill tone="success">{t('contractDetail.priceCheckYourSearch')}</Pill>
              )}
            </span>
            {line.isBlueprintCopy && (
              <span className="block text-[0.6875rem] tabular-nums text-text-dim">
                {t('contractDetail.itemMeTe', {
                  me: line.materialEfficiency ?? 0,
                  te: line.timeEfficiency ?? 0,
                })}
                {line.runs !== undefined &&
                  ` · ${t('contractDetail.runsShort', { runs: line.runs })}`}
              </span>
            )}
          </span>
          <span className="shrink-0 tabular-nums">×{formatCount(line.quantity)}</span>
          <RowMoreActions />
        </li>
      }
    />
  );
}
