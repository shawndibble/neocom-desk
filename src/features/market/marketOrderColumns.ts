import { sellOutlierMultiple } from '@/engine/market/orderBookDepth';
import type { RegionOrder } from '@/esi/endpoints';
import type { OrderFeeContext } from '@/engine/market/orderFees';
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';
import { formatMarketIsk } from '@/lib/isk';
import { formatVolume } from './format';

export const MARKET_ORDER_COLUMN_IDS = [
  'price',
  'fees',
  'finalPrice',
  'quantity',
  'jumps',
  'location',
  'security',
  'expiry',
  'range',
  'minVolume',
] as const;

export type MarketOrderColumnId = (typeof MARKET_ORDER_COLUMN_IDS)[number];

export const SELL_ORDER_COLUMN_IDS: readonly MarketOrderColumnId[] = [
  'price',
  'fees',
  'finalPrice',
  'quantity',
  'jumps',
  'location',
  'security',
  'expiry',
];
export const BUY_ORDER_COLUMN_IDS: readonly MarketOrderColumnId[] = MARKET_ORDER_COLUMN_IDS;

export const FEE_COLUMN_IDS: readonly MarketOrderColumnId[] = ['fees', 'finalPrice'];

export function isColumnWithheld(
  id: MarketOrderColumnId,
  { hideLocation, feeContext }: { hideLocation: boolean; feeContext: OrderFeeContext | null }
): boolean {
  return (
    (hideLocation && id === 'location') || (feeContext === null && FEE_COLUMN_IDS.includes(id))
  );
}

export const DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS: readonly MarketOrderColumnId[] =
  MARKET_ORDER_COLUMN_IDS.filter((id) => id !== 'minVolume' && !FEE_COLUMN_IDS.includes(id));

export const VISIBLE_MARKET_ORDER_COLUMNS_KEY = 'marketOrderVisibleColumns';

export const useVisibleMarketOrderColumns = createColumnVisibilitySetting({
  key: VISIBLE_MARKET_ORDER_COLUMNS_KEY,
  ids: MARKET_ORDER_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS,
  dropUnknown: true,
});

export const ORDER_HEADING_FIGURE_IDS = ['units', 'value'] as const;
export type OrderHeadingFigureId = (typeof ORDER_HEADING_FIGURE_IDS)[number];

export const DEFAULT_ORDER_HEADING_FIGURES: readonly OrderHeadingFigureId[] = ['units'];

export const ORDER_HEADING_FIGURES_KEY = 'marketOrderHeadingFigures';

export const useOrderHeadingFigures = createColumnVisibilitySetting({
  key: ORDER_HEADING_FIGURES_KEY,
  ids: ORDER_HEADING_FIGURE_IDS,
  defaultVisible: DEFAULT_ORDER_HEADING_FIGURES,
  allowEmpty: true,
  dropUnknown: true,
});

export const ORDER_BOOK_LOCATION_REM = { roomy: 16, squeezed: 9 } as const;

export const ORDER_BOOK_LOCATION_CLASS = {
  roomy: 'max-w-[16rem] truncate',
  squeezed: 'max-w-[9rem] truncate',
} as const;

const ORDER_BOOK_COLUMN_REM: Record<Exclude<MarketOrderColumnId, 'location'>, number> = {
  price: 4.75,
  fees: 5.25,
  finalPrice: 6.25,
  quantity: 4.125,
  jumps: 5.125,
  security: 4,
  expiry: 5.625,
  range: 5.25,
  minVolume: 6.25,
};

const ORDER_BOOK_FIGURE = { charRem: 0.36, paddingRem: 2.5 } as const;

const ORDER_BOOK_FIXED_REM = 2.5 + 2.75 + 0.25;

const ORDER_BOOK_PRICE_GLYPH_REM = 1.25;

export interface OrderBookFigureChars {
  priceChars: number;
  quantityChars: number;
  baitFlag: boolean;
  myOrder: boolean;
}

function figureRem(headerRem: number, chars: number, extraRem = 0): number {
  return Math.max(
    headerRem,
    chars * ORDER_BOOK_FIGURE.charRem + ORDER_BOOK_FIGURE.paddingRem + extraRem
  );
}

export function orderBookWidthsRem(
  visible: readonly MarketOrderColumnId[],
  { priceChars, quantityChars, baitFlag, myOrder }: OrderBookFigureChars
): { roomy: number; cards: number } {
  let rest = ORDER_BOOK_FIXED_REM;
  for (const id of visible) {
    if (id === 'location') continue;
    rest +=
      id === 'price'
        ? figureRem(
            ORDER_BOOK_COLUMN_REM.price,
            priceChars,
            (baitFlag ? ORDER_BOOK_PRICE_GLYPH_REM : 0) + (myOrder ? ORDER_BOOK_PRICE_GLYPH_REM : 0)
          )
        : id === 'quantity'
          ? figureRem(ORDER_BOOK_COLUMN_REM.quantity, quantityChars)
          : ORDER_BOOK_COLUMN_REM[id];
  }
  if (!visible.includes('location')) return { roomy: rest, cards: rest };
  return {
    roomy: rest + ORDER_BOOK_LOCATION_REM.roomy,
    cards: rest + ORDER_BOOK_LOCATION_REM.squeezed,
  };
}

export function orderBookFigureChars(
  rows: readonly RegionOrder[],
  bestSell: number | null,
  myOrderIds: ReadonlySet<number> = new Set()
): OrderBookFigureChars {
  let priceChars = 0;
  let quantityChars = 0;
  let baitFlag = false;
  let myOrder = false;
  for (const order of rows) {
    priceChars = Math.max(priceChars, formatMarketIsk(order.price).length);
    quantityChars = Math.max(quantityChars, formatVolume(order.volume_remain).length);
    if (!order.is_buy_order && sellOutlierMultiple(order.price, bestSell) !== null) baitFlag = true;
    if (myOrderIds.has(order.order_id)) myOrder = true;
  }
  return { priceChars, quantityChars, baitFlag, myOrder };
}
