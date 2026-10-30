/**
 * Full detail for one public contract, opened from a row in BPC Search or the
 * Contracts page's Search tab. Generalized out of `BpcContractModal` (issue
 * #928): the row a shopper clicked is only one line — a blueprint, a stack of
 * Tritanium — and a contract routinely bundles several, so "what else is on
 * this?" is a question no results table can answer on its own.
 *
 * A shopper asks two things of it: does this contract have what I need, and is
 * the cost fair? So the panel leads with the asking price and what is in it —
 * the line they searched for tagged "Your search", the rest dimmed — then a
 * live price check against the reader's Trade Hub (opening on sell orders:
 * what taking it outright costs), then where it is. A blueprint copy has no
 * market price, so its check is per run against similar copies instead.
 * Nothing has happened to a listed contract yet, so there is no timeline, only
 * the expiry. Decision 20261020-005242-contract-detail-price-check.
 *
 * Item lines come from the public ESI route, which needs no scope — the
 * character-scoped one the Contracts page's own History tab uses cannot serve
 * these at all, since no character here is party to them.
 *
 * Where the contract *is*, though, does need a character: a public contract is
 * as likely to sit in a player structure as an NPC station, and
 * `/universe/structures/{id}` is ACL-checked per character. So the location
 * goes through `loadContractLocationName` — the same station-or-structure
 * resolution the personal Contracts view uses — under the active Character.
 *
 * Callers supply the header figures (price, quantity, a blueprint's ME/TE/runs)
 * since what is worth showing there differs by row shape — everything below
 * that (location, expiry, contract id, contents) is the same for any public
 * contract.
 *
 * The contents list carries what judging the bundle needs and nothing else: an
 * icon per line so a pile is scannable rather than read word by word, ESI's
 * per-stack records merged into one line per item (`mergeContractItemLines`),
 * and the two sides of an item_exchange split under their own headings instead
 * of tagged inline — what the buyer hands over first, since that is the ask
 * being judged. Every line right-clicks into the same item actions the rest of
 * the app offers.
 */
import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
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
import { useMarketHub } from '@/features/market/hub';
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
  /**
   * Whose token resolves a player-structure location. Neither BPC Search nor
   * Contracts Search is per-Character itself — both read a shared snapshot —
   * but the structure endpoint behind the location is, and its ACL is per
   * Character.
   */
  characterId: number;
  contractId: number;
  locationId: number;
  regionName: string;
  /** The offer's solar system, when known; shown as the Route Safety link (rows list it as plain text). */
  system?: { id: number; name: string } | null;
  /** Epoch ms. */
  dateExpired: number;
  /** Header figures the caller already knows how to word — price, ME/TE, a haul's reward. The first leads. */
  statChips: readonly PublicContractDetailModalStatChip[];
  /**
   * What the contract costs in ISK, for the price check; `null` or absent when
   * there is no real ISK figure (a barter, a PLEX ask with no PLEX price yet).
   */
  askingIsk?: number | null;
  /**
   * The item type(s) the shopper searched for: their line is tagged and the
   * value split into theirs and the rest. `null` or absent means no search is
   * active, so nothing is tagged.
   */
  searchedTypeIds?: ReadonlySet<number> | null;
  /**
   * A blueprint listing's per-run comparison with similar copies, replacing the
   * hub price check. `null` is "asked, too few similar copies"; absent means
   * this is not a blueprint listing.
   */
  bpcCheck?: BpcPerRunCheck | null;
  /** The Items board's flag on this row (#4773), worded here beside the price check. */
  flag?: ContractFlag | null;
  /** The pilot's flag multiple, named in the overpriced sentence so the setting is findable. */
  flagMultiple?: number;
  /** Which side of the hub book the price check opens on; default sell orders. */
  defaultPriceSide?: PriceSide;
  /** Below market's estimate for the lines the hub cannot price (#5427); absent outside that board. */
  otherValue?: { value: number; lines: number } | null;
  onClose: () => void;
}

interface ItemsState {
  outcome: PublicContractItemsOutcome;
  typeNames: Map<number, string>;
}

/** The price check reads the live book, not a past day. */
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
  const hubId = useMarketHub((s) => s.value);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const isAbyssalType = useMutaplasmidLookup()?.isAbyssalType;
  const [location, setLocation] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<ItemsState | null | undefined>(undefined);
  const [abyssalValue, setAbyssalValue] = useState<AbyssalContractValue | undefined>(undefined);

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
      // Names for every line, not just the one the row was found through —
      // the bundle is the point.
      const typeNames =
        outcome.kind === 'items'
          ? await loadTypeNames(outcome.items.map((item) => item.type_id))
          : new Map<number, string>();
      if (!cancelled) setItems({ outcome, typeNames });
    })();
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  // Merged before anything reads the lines, so the price check and the
  // rendered list are counting the same things.
  const lines = useMemo(
    () =>
      items && items.outcome.kind === 'items'
        ? mergeContractItemLines(items.outcome.items, isAbyssalType)
        : [],
    [items, isAbyssalType]
  );
  const included = lines.filter((line) => line.isIncluded);
  const requested = lines.filter((line) => !line.isIncluded);

  // Which line(s) the shopper asked for. With no match nothing is tagged, so a
  // search that is not about this contract's contents never greys it out.
  const anySearched = searchedTypeIds !== null && lines.some((l) => searchedTypeIds.has(l.typeId));
  const searchedMark = (line: ContractItemLine): boolean | undefined =>
    anySearched ? searchedTypeIds!.has(line.typeId) : undefined;

  // PLEX trades only on its own market, so no hub lists it: price it from there.
  const hasPlex = lines.some((line) => line.typeId === PLEX_TYPE_ID);
  const plexPrice = usePlexPrice(hasPlex);
  const sellOverrides = useMemo(
    () => (plexPrice === null ? undefined : new Map([[PLEX_TYPE_ID, plexPrice]])),
    [plexPrice]
  );
  const checkLines = useMemo(() => {
    const abyssal = (line: ContractItemLine) => isAbyssalType?.(line.typeId) ?? false;
    // A copy shares its type with the original, which trades at the hub; the
    // copy never does, so it is never valued from that book.
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
    defaultSide: defaultPriceSide,
    sellOverrides,
    otherValue,
    searchedTypeIds: anySearched ? searchedTypeIds : null,
    asBuyer: true,
  });

  // Flag sentences (#4773): the row's flag, and the padded-bundle share, which
  // only this panel can say because it holds every line and its price. A flag
  // states the condition and what it would cost instead, never a verdict.
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

  // Each abyssal module is valued at its own MutaMarket estimate, apart from the
  // hub figure (it has no market price).
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

  /**
   * Only an item_exchange contract asking for something in return has two
   * sides to tell apart. On a one-sided contract the split would be a heading
   * over the whole list and an empty second section, so a single section
   * carries the whole list — headed for the side it actually holds, since a
   * list of things the reader must *supply* must never read as a list of
   * things they get.
   */
  const twoSided = included.length > 0 && requested.length > 0;
  const oneSidedHeading =
    requested.length > 0 && included.length === 0
      ? t('contractDetail.youHandOverHeading')
      : t('contractDetail.contentsHeading');

  return (
    <SlideOver
      open
      onClose={onClose}
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
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : items.outcome.kind === 'not-found' ? (
          // ESI no longer recognizes this contract_id as public — it has
          // expired, been fulfilled, or was withdrawn since the snapshot
          // that surfaced this row. An ordinary outcome for a row clicked
          // some time after it synced, not a fetch failure.
          <EmptyState
            title={t('contractDetail.noLongerListedTitle')}
            hint={t('contractDetail.noLongerListedHint')}
          />
        ) : lines.length === 0 ? (
          <EmptyState title={t('contracts.detailNoItems')} className="py-4" />
        ) : twoSided ? (
          <>
            <ItemGroup
              // Keyed on contractId so each group's expanded state resets when another contract opens.
              key={`${contractId}-hand`}
              heading={t('contractDetail.youHandOverHeading')}
              lines={requested}
              typeNames={items.typeNames}
              searched={searchedMark}
            />
            <ItemGroup
              key={`${contractId}-receive`}
              heading={t('contractDetail.youReceiveHeading')}
              lines={included}
              typeNames={items.typeNames}
              searched={searchedMark}
            />
          </>
        ) : (
          <ItemGroup
            key={`${contractId}-all`}
            heading={oneSidedHeading}
            lines={lines}
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
          <ContractAbyssalValue value={abyssalValue} />
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

/**
 * A blueprint copy has no market price (it circulates only by contract), so it
 * is held per run against similar copies. `null` is "too few similar copies".
 */
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
    // Under the median per run is money kept: the Saving is the diff turned over.
    const saving = -check.diff;
    // Judged on the printed saving, so the words match the figure and its tone.
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

/** A group longer than this shows only this many lines until expanded. */
const ITEM_CAP = 10;
/** A group this short shows everything: hiding a row or two behind a button saves nothing. */
const ITEM_NO_CAP_MAX = 12;

/**
 * One headed list of lines. `searched` is `undefined` when no search is
 * active; otherwise it says whether a line is the one asked for.
 *
 * Display-only cap: searched lines are pinned first, then the list stops at
 * `ITEM_CAP` behind a "Show N more" button. The caller's price check reads the
 * full `lines`, never what is visible here.
 */
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

/**
 * One line. The name is a link to the Market Browser, which also gives the row
 * its keyboard focus: a right-click menu opened with Shift+F10 fires from
 * whatever is focused inside the row, so the link doubles as the menu's
 * keyboard handle and the row needs no `tabIndex` of its own competing with it
 * for a tab stop.
 *
 * `searched`: `true` is the line the shopper searched for (tagged), `false` an
 * extra (dimmed), `undefined` no search (plain). The tag is a word, so the dim
 * is never the only signal.
 */
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
      // This line's own ME/TE/runs, when ESI reported all three.
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
                <ItemInfoLink typeId={line.typeId}>{name}</ItemInfoLink>
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
        </li>
      }
    />
  );
}
