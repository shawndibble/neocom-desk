import { describe, it, expect } from 'vitest';
import {
  COMPARED_HUBS,
  DAILY_JOB_HUBS,
  TRADE_HUBS,
  DEFAULT_TRADE_HUB,
  getTradeHub,
  hubFeeDiscountFactor,
  AMARR_FEE_DISCOUNT_UNTIL_MS,
} from './hubs';

describe('TRADE_HUBS', () => {
  it('lists the five empire trade hubs and Manifest with verified station/system/region IDs', () => {
    expect(TRADE_HUBS.map((hub) => hub.id)).toEqual([
      'jita',
      'amarr',
      'dodixie',
      'rens',
      'hek',
      'manifest',
    ]);

    expect(getTradeHub('jita')).toMatchObject({
      stationId: 60003760,
      systemId: 30000142,
      regionId: 10000002,
    });
    expect(getTradeHub('amarr')).toMatchObject({
      stationId: 60008494,
      systemId: 30002187,
      regionId: 10000043,
    });
    expect(getTradeHub('dodixie')).toMatchObject({
      stationId: 60011866,
      systemId: 30002659,
      regionId: 10000032,
    });
    expect(getTradeHub('rens')).toMatchObject({
      stationId: 60004588,
      systemId: 30002510,
      regionId: 10000030,
    });
    expect(getTradeHub('hek')).toMatchObject({
      stationId: 60005686,
      systemId: 30002053,
      regionId: 10000042,
    });
    expect(getTradeHub('manifest')).toMatchObject({
      stationId: 60015249,
      systemId: 30100032,
      regionId: 10001004,
      systemName: 'Manifest',
      name: 'Manifest V - AIR Laboratories Trade Center',
    });
  });

  it('has no duplicate station, system, or region IDs', () => {
    expect(new Set(TRADE_HUBS.map((hub) => hub.stationId)).size).toBe(TRADE_HUBS.length);
    expect(new Set(TRADE_HUBS.map((hub) => hub.systemId)).size).toBe(TRADE_HUBS.length);
    expect(new Set(TRADE_HUBS.map((hub) => hub.regionId)).size).toBe(TRADE_HUBS.length);
  });

  it('carries a short system name distinct from the full station name (UX-REVIEW #6)', () => {
    expect(TRADE_HUBS.map((hub) => hub.systemName)).toEqual([
      'Jita',
      'Amarr',
      'Dodixie',
      'Rens',
      'Hek',
      'Manifest',
    ]);
  });

  it('defaults to Jita 4-4', () => {
    expect(DEFAULT_TRADE_HUB.id).toBe('jita');
    expect(DEFAULT_TRADE_HUB).toBe(TRADE_HUBS[0]);
  });

  it('getTradeHub returns undefined for an unknown id', () => {
    expect(getTradeHub('unknown' as never)).toBeUndefined();
  });
});

describe('compared and daily-job hubs', () => {
  it('keeps Manifest out of the every-hub views but lists it as a hub', () => {
    expect(COMPARED_HUBS.map((hub) => hub.id)).toEqual(['jita', 'amarr', 'dodixie', 'rens', 'hek']);
    expect(getTradeHub('manifest')?.compared).toBe(false);
  });

  it('keeps Manifest out of the daily backend jobs until they cover Exordium', () => {
    expect(DAILY_JOB_HUBS.map((hub) => hub.id)).toEqual([
      'jita',
      'amarr',
      'dodixie',
      'rens',
      'hek',
    ]);
  });

  it('charges Exordium a Safety Tax and no empire hub one', () => {
    expect(getTradeHub('manifest')?.safetyTaxPct).toBeGreaterThan(0);
    expect(COMPARED_HUBS.every((hub) => hub.safetyTaxPct === 0)).toBe(true);
  });
});

describe('hubFeeDiscountFactor', () => {
  const amarr = getTradeHub('amarr')!;
  const jita = getTradeHub('jita')!;
  const start = Date.UTC(2026, 10, 10, 11);

  it('halves Amarr fees while the Deaconry discount runs', () => {
    expect(hubFeeDiscountFactor(amarr, start)).toBe(0.5);
    expect(hubFeeDiscountFactor(amarr, AMARR_FEE_DISCOUNT_UNTIL_MS - 1)).toBe(0.5);
  });

  it('stops applying at the end date, with no change needed', () => {
    expect(hubFeeDiscountFactor(amarr, AMARR_FEE_DISCOUNT_UNTIL_MS)).toBe(1);
    expect(hubFeeDiscountFactor(amarr, AMARR_FEE_DISCOUNT_UNTIL_MS + 86_400_000)).toBe(1);
  });

  it('does not apply before the Fractured Skies expansion', () => {
    expect(hubFeeDiscountFactor(amarr, start - 1)).toBe(1);
  });

  it('is 1 at every other hub, and for an unknown hub', () => {
    for (const hub of TRADE_HUBS.filter((h) => h.id !== 'amarr')) {
      expect(hubFeeDiscountFactor(hub, start)).toBe(1);
    }
    expect(hubFeeDiscountFactor(undefined, start)).toBe(1);
    expect(jita.feeDiscount).toBeUndefined();
  });
});
