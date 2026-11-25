import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { buildDemoViews, DEMO_WIDGETS } from './demoData';

const t = ((key: string) => key) as unknown as TFunction;
const NOW = Date.parse('2026-10-11T12:00:00Z');

describe('buildDemoViews', () => {
  it('builds a View with data for every demo widget', () => {
    const views = buildDemoViews(t, NOW);
    for (const widget of DEMO_WIDGETS) {
      expect(views.get(widget.id)?.status.hasData, widget.id).toBe(true);
    }
  });

  it('draws the kinds with no demo feed from the Overview gallery sample', () => {
    const views = buildDemoViews(t, NOW);
    expect(views.get('d-hauling')?.number.value).toBe('48M');
    expect(views.get('d-profit')?.rows.length).toBeGreaterThan(0);
  });

  it('builds the Wallet with its own Range: an area chart over the journal', () => {
    const views = buildDemoViews(t, NOW);
    const chart = views.get('d-wallet')?.chart;
    expect(chart).toBeDefined();
    expect(chart?.kind).not.toBe('bars');
  });
});
