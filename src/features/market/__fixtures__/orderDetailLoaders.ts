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

export function withOrderDetailLoaders(ui: ReactNode, loaders: OrderDetailLoaders) {
  return createElement(OrderDetailLoadersContext.Provider, { value: loaders }, ui);
}
