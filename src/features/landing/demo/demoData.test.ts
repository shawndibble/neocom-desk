import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { buildDemoViews, DEMO_WIDGETS } from './demoData';

const t = ((key: string) => key) as unknown as TFunction;
const NOW = Date.parse('2026-10-11T12:00:00Z');

describe('buildDemoViews', () => {
  it("builds each widget with its own settings: the Wallet flow widget draws the Wallet's Flow", () => {
    expect(DEMO_WIDGETS.find((w) => w.id === 'd-flow')).toMatchObject({ show: 'flow' });
    const views = buildDemoViews(t, NOW);
    // Flow is net bars with a table by ref type; Balance is an area chart over the journal.
    expect(views.get('d-flow')?.chart?.kind).toBe('bars');
    expect(views.get('d-flow')?.table?.columns[0]?.key).toBe('type');
    expect(views.get('d-wallet')?.chart?.kind).not.toBe('bars');
  });
});
