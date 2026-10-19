import { describe, it, expect } from 'vitest';
import { chartOpenSideLabel, openSideLabel } from './priceHistoryLabels';

const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${String(o.region)}` : k);

describe('openSideLabel (table and CSV)', () => {
  it('keeps the plain Buy / Sell keys', () => {
    expect(openSideLabel(t, 'buy')).toBe('market.priceHistory.openBuy');
    expect(openSideLabel(t, 'sell')).toBe('market.priceHistory.openSell');
  });

  it('keeps the region-prefixed keys', () => {
    expect(openSideLabel(t, 'buy', 'Jita 4-4')).toBe('market.priceHistory.regionBuy:Jita 4-4');
    expect(openSideLabel(t, 'sell', 'Jita 4-4')).toBe('market.priceHistory.regionSell:Jita 4-4');
  });
});

describe('chartOpenSideLabel (legend and tooltip)', () => {
  it('names the best order at close', () => {
    expect(chartOpenSideLabel(t, 'buy')).toBe('market.priceHistory.openBuyAtClose');
    expect(chartOpenSideLabel(t, 'sell')).toBe('market.priceHistory.openSellAtClose');
  });

  it('prefixes the station or region', () => {
    expect(chartOpenSideLabel(t, 'buy', 'Jita 4-4')).toBe(
      'market.priceHistory.regionBuyAtClose:Jita 4-4'
    );
    expect(chartOpenSideLabel(t, 'sell', 'Jita 4-4')).toBe(
      'market.priceHistory.regionSellAtClose:Jita 4-4'
    );
  });
});
