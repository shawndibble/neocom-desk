import { describe, expect, it } from 'vitest';
import { TREND_MAX_SERIES } from '@/engine/market/trendSeries';
import { addWidget, type OverviewLayout } from './layout';
import { TREND_PRESETS, trendPreset } from './trendPresets';

const empty: OverviewLayout = { version: 1, widgets: [] };

describe('Market Trend presets', () => {
  it('offers PLEX, Large Skill Injector, Minerals and Ore, each within the series cap', () => {
    expect(TREND_PRESETS.map((p) => p.id)).toEqual(['plex', 'injector', 'minerals', 'ore']);
    for (const p of TREND_PRESETS) {
      expect(p.items.length).toBeGreaterThan(0);
      expect(p.items.length).toBeLessThanOrEqual(TREND_MAX_SERIES);
      expect(new Set(p.items).size).toBe(p.items.length);
    }
    expect(trendPreset('plex')?.items).toEqual([44992]);
    expect(trendPreset('injector')?.items).toEqual([40520]);
  });

  it('prices minerals and ore, three items each, at Jita; PLEX and the injector carry no hubs', () => {
    expect(trendPreset('minerals')).toMatchObject({ items: [34, 35, 36], trendHubs: ['jita'] });
    expect(trendPreset('ore')).toMatchObject({ items: [1230, 1228, 1224], trendHubs: ['jita'] });
    expect(trendPreset('plex')?.trendHubs).toBeUndefined();
    expect(trendPreset('injector')?.trendHubs).toBeUndefined();
  });

  it('adds a widget with its own items, title and view; instances stay independent', () => {
    const plex = trendPreset('plex')!;
    const a = addWidget(empty, 'marketTrend', () => 'a', {
      title: 'PLEX price',
      trendItems: plex.items,
      view: plex.view,
    });
    const b = addWidget(a, 'marketTrend', () => 'b');
    expect(a.widgets[0]).toMatchObject({ title: 'PLEX price', trendItems: [44992] });
    expect(b.widgets[1].trendItems).toBeUndefined();
    expect(b.widgets[1].title).toBeUndefined();
    a.widgets[0].trendItems!.push(1);
    expect(plex.items).toEqual([44992]);
  });
});
