import i18n from 'i18next';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { priceSourceLabel } from './priceSource';

const t = i18n.t.bind(i18n);

describe('priceSourceLabel', () => {
  it('names the chosen hub, Jita or not', () => {
    expect(priceSourceLabel(t, 'Jita', null)).toBe('Jita prices');
    expect(priceSourceLabel(t, 'Amarr', null)).toBe('Amarr prices');
    expect(priceSourceLabel(t, 'Amarr', null)).not.toMatch(/Jita/);
  });

  it('names the buyback, not the hub behind it', () => {
    expect(priceSourceLabel(t, 'Jita', 85)).toBe('your corp buyback rate');
    expect(priceSourceLabel(t, 'Jita', 85)).not.toMatch(/Jita/);
  });
});
