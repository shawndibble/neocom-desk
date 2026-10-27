/**
 * Test-only Order Detail loaders: every fetch an in-memory spy, so a test
 * sets only the answers it cares about and asserts on the calls. Region
 * books and price history never resolve by default (a check "still
 * running"); routes resolve as unknown, structures as unreadable, and no
 * item reprocesses into anything. A `.ts` file (`createElement`, no JSX) so
 * Fast Refresh's component-only-exports rule doesn't apply to a test helper.
 */
import { createElement, type ReactNode } from 'react';
import { vi, type Mock } from 'vitest';
import { OrderDetailLoadersContext, type OrderDetailLoaders } from '../orderDetailLoaders';

export type FakeOrderDetailLoaders = {
  [K in keyof OrderDetailLoaders]: Mock<OrderDetailLoaders[K]>;
};

export function fakeOrderDetailLoaders(): FakeOrderDetailLoaders {
  return {
    regionCompetition: vi.fn<OrderDetailLoaders['regionCompetition']>(() => new Promise(() => {})),
    structureCompetition: vi.fn<OrderDetailLoaders['structureCompetition']>(async () => null),
    jumpsBetween: vi.fn<OrderDetailLoaders['jumpsBetween']>(async () => ({
      kind: 'unknown',
      reason: 'noRoute',
    })),
    priceHistory: vi.fn<OrderDetailLoaders['priceHistory']>(() => new Promise(() => {})),
    reprocessing: vi.fn<OrderDetailLoaders['reprocessing']>(async () => ({})),
    stationBestPrices: vi.fn<OrderDetailLoaders['stationBestPrices']>(async () => new Map()),
  };
}

/** `ui` under `loaders` — for `render(withOrderDetailLoaders(<Panel />, loaders))`. */
export function withOrderDetailLoaders(ui: ReactNode, loaders: OrderDetailLoaders) {
  return createElement(OrderDetailLoadersContext.Provider, { value: loaders }, ui);
}
