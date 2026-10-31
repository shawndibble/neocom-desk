/**
 * Sell-order ISK split by how soon each order needs the pilot: Balance's
 * "ISK waiting" breakdown. Reads the same judgements as Open Orders (`orderUrgency`),
 * so the two pages never disagree. An order nobody could check against rivals
 * is its own part, never counted as healthy.
 */
import { orderGroupKey, type OpenOrderRow } from './openOrdersModel';
import { orderUrgency } from './orderUrgency';

export interface HealthPart {
  isk: number;
  orders: number;
}

export interface SellOrderHealth {
  healthy: HealthPart;
  needsYou: HealthPart;
  watch: HealthPart;
  notChecked: HealthPart;
  total: HealthPart;
}

export function sellOrderHealth(rows: readonly OpenOrderRow[]): SellOrderHealth {
  const part = (): HealthPart => ({ isk: 0, orders: 0 });
  const health: SellOrderHealth = {
    healthy: part(),
    needsYou: part(),
    watch: part(),
    notChecked: part(),
    total: part(),
  };
  for (const row of rows) {
    if (row.isBuyOrder) continue;
    const urgency = orderUrgency(row);
    const target =
      urgency === 'act'
        ? health.needsYou
        : orderGroupKey(row) === 'notChecked'
          ? health.notChecked
          : urgency === 'watch'
            ? health.watch
            : health.healthy;
    target.isk += row.iskTiedUp;
    target.orders += 1;
    health.total.isk += row.iskTiedUp;
    health.total.orders += 1;
  }
  return health;
}
