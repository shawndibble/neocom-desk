import { describe, expect, it } from 'vitest';
import type { DeadlineSeverity } from '@/engine/severity';
import {
  layoutBoard,
  soonestDeadline,
  type BoardCardSpec,
  type BoardDeadline,
} from './boardLayout';
import type { OverviewCardKey } from './hiddenCards';

function spec(
  key: OverviewCardKey,
  placement: BoardCardSpec['placement'] = 'card',
  extra: Partial<BoardCardSpec> = {}
): BoardCardSpec {
  return { key, placement, severity: 'clear', ...extra };
}

const keys = (specs: readonly BoardCardSpec[]) => specs.map((s) => s.key);

const BOARD: BoardCardSpec[] = [
  spec('orders'),
  spec('mining', 'card', { severity: 'warning' }),
  spec('contracts'),
  spec('planetary', 'card', { severity: 'critical' }),
  spec('industry'),
  spec('alerts', 'column'),
];

const ORDER: OverviewCardKey[] = ['industry', 'contracts', 'orders', 'planetary', 'mining'];
const showAll = () => true;

describe('layoutBoard on desktop', () => {
  it('lays the grid out in the pilot’s order, alerts in its own column', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: false,
      shown: showAll,
      phoneFullCount: 2,
      order: ORDER,
    });
    expect(keys(layout.full)).toEqual(ORDER);
    expect(layout.folded).toEqual([]);
    expect(layout.column?.key).toBe('alerts');
  });

  it('drops hidden cards without moving the rest', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: false,
      shown: (key) => key !== 'contracts' && key !== 'alerts',
      phoneFullCount: 2,
      order: ORDER,
    });
    expect(keys(layout.full)).toEqual(['industry', 'orders', 'planetary', 'mining']);
    expect(layout.column).toBeNull();
  });

  it('leaves out a card this Character cannot read', () => {
    const layout = layoutBoard([...BOARD, spec('structures', 'card', { available: false })], {
      isPhone: false,
      shown: showAll,
      phoneFullCount: 2,
      order: [...ORDER, 'structures'],
    });
    expect(keys(layout.full)).not.toContain('structures');
  });

  it('puts a card missing from the order after the ones in it', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: false,
      shown: showAll,
      phoneFullCount: 2,
      order: ['mining'],
    });
    expect(keys(layout.full)[0]).toBe('mining');
  });
});

describe('layoutBoard on a phone', () => {
  /*
   * The pilot's call over urgency ranking: their first two cards are the full
   * ones whatever is on fire. Planetary here is critical and still folds,
   * because it is fourth in the order.
   */
  it('gives the full slots to the first cards in the order, urgency aside', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: true,
      shown: showAll,
      phoneFullCount: 2,
      order: ORDER,
    });
    expect(keys(layout.full)).toEqual(['industry', 'contracts']);
    expect(keys(layout.folded)).toEqual(['alerts', 'orders', 'planetary', 'mining']);
    expect(layout.column).toBeNull();
  });

  it('skips hidden cards when filling the slots', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: true,
      shown: (key) => key !== 'industry' && key !== 'alerts',
      phoneFullCount: 2,
      order: ORDER,
    });
    expect(keys(layout.full)).toEqual(['contracts', 'orders']);
    expect(keys(layout.folded)).toEqual(['planetary', 'mining']);
  });
});

describe('soonestDeadline', () => {
  const at = (ms: number, to: string, severity: DeadlineSeverity = 'watch'): BoardDeadline => ({
    at: ms,
    note: to,
    severity,
    to,
  });

  it('picks the soonest clock among shown cards and the always-on extras', () => {
    const specs = [
      spec('planetary', 'card', { deadline: at(300, '/pi') }),
      spec('industry', 'card', { deadline: at(100, '/industry') }),
    ];
    expect(soonestDeadline(specs, showAll, [at(200, '/skills')])?.to).toBe('/industry');
  });

  it('takes nothing from a hidden or unreadable card', () => {
    const specs = [
      spec('planetary', 'card', { deadline: at(100, '/pi') }),
      spec('structures', 'card', { deadline: at(50, '/corp'), available: false }),
    ];
    expect(soonestDeadline(specs, (key) => key !== 'planetary', [at(200, '/skills')])?.to).toBe(
      '/skills'
    );
  });

  it('is null with no clock at all', () => {
    expect(soonestDeadline([spec('orders')], showAll, [])).toBeNull();
  });
});
