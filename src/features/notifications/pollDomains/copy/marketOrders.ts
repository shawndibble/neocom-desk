import type { ItemNames } from './industryJobs';
import type {
  MarketOrderNotificationFire,
  MarketOrderUndercutFire,
  OrdersLapsingFire,
} from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { formatIsk } from '@/lib/isk';
import { type DomainCopy, type NoNames, fired, HOUR_MS } from './shared';
import { formatNumber } from '@/lib/numberLocale';

export const marketOrderCopy: DomainCopy<MarketOrderNotificationFire, ItemNames> = {
  poll: (fire, character, names) => {
    const item = names.item ?? `#${fire.typeId}`;
    return {
      title: fired('marketOrderFilled', 'title', { character }),
      // "1 x Tritanium" is noise; a bare item name is not.
      body:
        fire.quantity > 1
          ? fired('marketOrderFilled', 'bodyWithQuantity', {
              item,
              quantity: formatNumber(fire.quantity),
            })
          : fired('marketOrderFilled', 'body', { item }),
    };
  },
  // The fill itself — what sold, how many, to whom. ESI's transactions carry
  // no order id, so the panel resolves the item to its newest sell; every
  // other subject is an exact row id.
  subjectOf: (fire) => fire.typeId,
};

export const marketOrderUndercutCopy: DomainCopy<MarketOrderUndercutFire, ItemNames> = {
  poll: (fire, character, names) => {
    const item = names.item ?? `#${fire.typeId}`;
    const vars = {
      character,
      item,
      price: formatIsk(fire.price, 2),
      rival: formatIsk(fire.rivalPrice, 2),
    };
    return {
      title: fired('marketOrderUndercut', 'title'),
      body: fired('marketOrderUndercut', fire.isBuyOrder ? 'buyBody' : 'sellBody', vars),
    };
  },
  // The beaten order's own row on Market Orders (`notificationOptions.ts`'s
  // `highlightRow`).
  subjectOf: (fire) => fire.orderId,
};

export const ordersLapsingCopy: DomainCopy<OrdersLapsingFire, NoNames> & {
  readonly push: PushCopy<OrdersLapsingFire, NoNames>;
} = {
  poll: (fire, character) => ({
    title: fired('ordersLapsing', 'title'),
    body: fired('ordersLapsing', 'body', {
      character,
      count: fire.count,
      hours: Math.round(fire.thresholdMs / HOUR_MS),
    }),
  }),
  // Hedged: relisting the orders — what the warning prompts — falsifies it.
  push: (fire, character) => {
    assertProjectionWording('ordersLapsing', 'hedge');
    const hours = Math.round(fire.thresholdMs / HOUR_MS);
    return {
      title: 'Market orders lapsing',
      body: `${character} had ${fire.count === 1 ? '1 market order' : `${fire.count} market orders`} due to lapse within ${hours} hours.`,
    };
  },
};
