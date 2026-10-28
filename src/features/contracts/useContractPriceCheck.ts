/**
 * The price check shared by every contract detail panel: what a contract's
 * items are worth at the Trade Hub, against the ask (or, for items for items,
 * Included against Requested). Glue between the pure
 * `engine/contracts/contractPriceCheck`, the price loader and the strings; a
 * panel works out its lines, ask and basis and renders what comes back
 * (decision 20261020-005242-contract-detail-price-check).
 *
 * The reader flips Buy and Sell; `defaultSide` is where it opens.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BundleSplit } from '@/engine/contracts/contractFlags';
import {
  iskPriceCheck,
  itemSwapPriceCheck,
  splitBySearch,
  unitPricesOn,
  type PriceCheckLine,
} from '@/engine/contracts/contractPriceCheck';
import type { PriceSide } from '@/engine/miningTax/priceBasis';
import type { TradeHub } from '@/market/hubs';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { formatSignedPercent, percentDirection } from '@/lib/formatSignedPercent';
import { formatContractIsk } from '@/lib/isk';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import type { PriceCheckFlip, PriceCheckRowModel } from './ContractPriceCheck';
import { loadContractPrices, type PriceBasisChoice } from './contractPrices';

export interface ContractPriceCheckView {
  heading: string;
  rows: PriceCheckRowModel[];
  flip: PriceCheckFlip;
  message?: string;
  busy: boolean;
  /**
   * The searched lines' value against the rest at the side on screen, when a
   * search is active: what the padded-bundle sentence (#4773) is worded from.
   */
  split?: BundleSplit & { restLines: number; side: PriceSide };
}

export interface ContractPriceCheckArgs {
  /** What is being checked; a change loads prices again. */
  identity: string;
  /** The caller's verdict that there is something to compare; `false` returns `null`. */
  enabled: boolean;
  included: readonly PriceCheckLine[];
  requested: readonly PriceCheckLine[];
  /** ISK ask; 0 for none (items for items). */
  asking: number;
  /** An Open Price of a past UTC day, or the live book. */
  basis: PriceBasisChoice;
  hub: TradeHub;
  defaultSide: PriceSide;
  /** Live sell prices for what the hub never lists (PLEX). Keep the map stable between renders: a new one reloads the prices. */
  sellOverrides?: ReadonlyMap<number, number>;
  /** The item(s) the shopper searched for: splits the value into theirs and the rest. */
  searchedTypeIds?: ReadonlySet<number> | null;
  /**
   * What the lines the hub cannot price would fetch at other contracts' asks
   * (Below market, #5427). Shown apart from the hub value and never in the
   * difference. Only the board holds the snapshot this takes, so it is absent
   * elsewhere.
   */
  otherValue?: { value: number; lines: number } | null;
}

/** The UTC day as "Aug 25": Open Prices are per UTC day, so it is never shifted to the viewer's zone. */
function utcDayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function useContractPriceCheck(args: ContractPriceCheckArgs): ContractPriceCheckView | null {
  const {
    identity,
    enabled,
    included,
    requested,
    asking,
    basis,
    hub,
    defaultSide,
    sellOverrides,
    searchedTypeIds = null,
    otherValue = null,
  } = args;
  const { t } = useTranslation();
  const unavailableLabel = usePricesUnavailableLabel();
  const [side, setSide] = useState<PriceSide>(defaultSide);

  const swap = requested.length > 0;
  const typeIds = [...new Set([...included, ...requested].map((line) => line.typeId))].sort(
    (a, b) => a - b
  );
  const day = basis.kind === 'day' ? basis.date : null;
  const key = enabled ? `${identity}:${hub.id}:${day ?? 'live'}:${typeIds.join(',')}` : null;
  // Keyed on the string above, not on the arrays, which are new every render.
  const loader = useCallback(
    () => loadContractPrices(hub, typeIds, basis, sellOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, sellOverrides]
  );
  const load = useKeyedLoad(key, loader);

  if (!enabled) return null;

  const other: PriceSide = side === 'buy' ? 'sell' : 'buy';
  const wordOf = (s: PriceSide) =>
    t(s === 'buy' ? 'contractDetail.priceCheckBuy' : 'contractDetail.priceCheckSell');
  const sideWord = wordOf(side);
  const view = {
    heading:
      day !== null
        ? t('contractDetail.priceCheckHeadingDay', {
            hub: hub.stationLabel,
            date: utcDayLabel(day),
          })
        : t('contractDetail.priceCheckHeadingLive', { hub: hub.stationLabel }),
    flip: {
      label: sideWord,
      showOther: t('contractDetail.priceCheckShowSide', { side: wordOf(other).toLowerCase() }),
      onFlip: () => setSide(other),
    },
  };

  if (load.status !== 'ready') {
    return load.status === 'failed'
      ? { ...view, rows: [], busy: false, message: unavailableLabel }
      : { ...view, rows: [], busy: true };
  }

  const { prices, unreachable } = load.data;
  const check = swap
    ? itemSwapPriceCheck({ included, requested, prices, side })
    : iskPriceCheck({ asking, included, prices, side });
  if (check.kind === 'unavailable') {
    const message = unreachable
      ? unavailableLabel
      : day !== null && prices.size === 0
        ? t('contractDetail.priceCheckNoDayPrice', { date: utcDayLabel(day) })
        : t('contractDetail.priceCheckNotPriced', { hub: hub.stationLabel });
    return { ...view, rows: [], busy: false, message };
  }

  const unpricedNote =
    check.unpricedLines > 0
      ? t('contracts.detailMarketValueUnpriced', { count: check.unpricedLines })
      : undefined;
  const pick = (diff: number, words: { below: string; above: string; level: string }) =>
    words[percentDirection(diff)];
  const rows: PriceCheckRowModel[] = [];
  let splitView: ContractPriceCheckView['split'];
  if ('included' in check) {
    rows.push(
      { label: t('contractDetail.priceCheckIncluded'), value: formatContractIsk(check.included) },
      { label: t('contractDetail.priceCheckRequested'), value: formatContractIsk(check.requested) }
    );
    if (asking > 0)
      rows.push({ label: t('contractDetail.priceCheckAsking'), value: formatContractIsk(asking) });
    if (check.diff !== null) {
      const sentence = pick(check.diff, {
        below: t('contractDetail.priceCheckIncludedBelow'),
        above: t('contractDetail.priceCheckIncludedAbove'),
        level: t('contractDetail.priceCheckIncludedLevel'),
      });
      rows.push({
        label: t('contractDetail.priceCheckDifference'),
        value: formatSignedPercent(check.diff),
        note: unpricedNote ? `${sentence} ${unpricedNote}` : sentence,
      });
    }
  } else {
    const pricedCount = included.length - check.unpricedLines;
    rows.push(
      { label: t('contractDetail.priceCheckAsking'), value: formatContractIsk(check.asking) },
      {
        label: sideWord,
        value: formatContractIsk(check.value),
        note:
          check.unpricedLines > 0
            ? `${t('contractDetail.priceCheckPriced', { priced: pricedCount, total: included.length })} ${unpricedNote}`
            : undefined,
      }
    );
    if (otherValue && otherValue.value > 0) {
      rows.push({
        label: t('contractDetail.priceCheckOtherContracts'),
        value: t('contractDetail.priceCheckOtherContractsValue', {
          value: formatContractIsk(otherValue.value),
        }),
        note: t('contractDetail.priceCheckOtherContractsNote', { count: otherValue.lines }),
        dim: true,
      });
    }
    const split = splitBySearch(included, searchedTypeIds, unitPricesOn(prices, side));
    const restLines = split ? split.rest.pricedLines + split.rest.unpricedLines : 0;
    if (split && restLines > 0) {
      splitView = {
        mine: split.mine.total,
        rest: split.rest.total,
        unpricedLines: split.mine.unpricedLines + split.rest.unpricedLines,
        restLines,
        side,
      };
      rows.push(
        {
          label: t('contractDetail.priceCheckYourSearch'),
          value: formatContractIsk(split.mine.total),
          sub: true,
        },
        {
          label: t('contractDetail.priceCheckOtherItems'),
          value: formatContractIsk(split.rest.total),
          note: t('contractDetail.priceCheckOtherItemsNote', { count: restLines }),
          sub: true,
        }
      );
    }
    if (check.diff !== null) {
      const sideLower = sideWord.toLowerCase();
      rows.push({
        label: t('contractDetail.priceCheckDifference'),
        value: formatSignedPercent(check.diff),
        note: [
          pick(check.diff, {
            below: t('contractDetail.priceCheckAskingBelow', { side: sideLower }),
            above: t('contractDetail.priceCheckAskingAbove', { side: sideLower }),
            level: t('contractDetail.priceCheckAskingLevel', { side: sideLower }),
          }),
          ...(check.unpricedLines > 0
            ? [
                t('contractDetail.priceCheckAgainstPriced', {
                  priced: pricedCount,
                  total: included.length,
                }),
              ]
            : []),
        ].join(' '),
      });
    }
  }
  return { ...view, rows, busy: false, ...(splitView ? { split: splitView } : {}) };
}
