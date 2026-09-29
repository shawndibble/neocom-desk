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
  placement: BoardCardSpec['placement'],
  severity: DeadlineSeverity | null = 'clear',
  extra: Partial<BoardCardSpec> = {}
): BoardCardSpec {
  return { key, placement, severity, ...extra };
}

const keys = (specs: readonly BoardCardSpec[]) => specs.map((s) => s.key);

const BOARD: BoardCardSpec[] = [
  spec('orders', 'ranked', 'clear'),
  spec('mining', 'ranked', 'warning'),
  spec('contracts', 'folded', 'watch'),
  spec('planetary', 'ranked', 'critical'),
  spec('industry', 'ranked', null),
  spec('alerts', 'column', 'watch'),
];

const showAll = () => true;

describe('layoutBoard on desktop', () => {
  it('lays the grid out in declaration order, alerts in its own column', () => {
    const layout = layoutBoard(BOARD, { isPhone: false, shown: showAll, phoneFullCount: 2 });
    expect(keys(layout.full)).toEqual(['orders', 'mining', 'contracts', 'planetary', 'industry']);
    expect(layout.folded).toEqual([]);
    expect(layout.column?.key).toBe('alerts');
  });

  it('drops hidden cards without moving the rest', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: false,
      shown: (key) => key !== 'mining' && key !== 'alerts',
      phoneFullCount: 2,
    });
    expect(keys(layout.full)).toEqual(['orders', 'contracts', 'planetary', 'industry']);
    expect(layout.column).toBeNull();
  });

  it('leaves out a card this Character cannot read', () => {
    const layout = layoutBoard(
      [...BOARD, spec('structures', 'ranked', 'critical', { available: false })],
      {
        isPhone: false,
        shown: showAll,
        phoneFullCount: 2,
      }
    );
    expect(keys(layout.full)).not.toContain('structures');
  });
});

describe('layoutBoard on a phone', () => {
  it('gives the full cards to the worst ranked domains, loading last', () => {
    const layout = layoutBoard(BOARD, { isPhone: true, shown: showAll, phoneFullCount: 2 });
    expect(keys(layout.full)).toEqual(['planetary', 'mining']);
  });

  it('folds the column first, then always-folded cards, then the ranked overflow', () => {
    const layout = layoutBoard(BOARD, { isPhone: true, shown: showAll, phoneFullCount: 2 });
    expect(keys(layout.folded)).toEqual(['alerts', 'contracts', 'orders', 'industry']);
    expect(layout.column).toBeNull();
  });

  it('ranks only what is shown, so a hidden card never takes a full slot', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: true,
      shown: (key) => key !== 'planetary' && key !== 'alerts',
      phoneFullCount: 2,
    });
    expect(keys(layout.full)).toEqual(['mining', 'orders']);
    expect(keys(layout.folded)).toEqual(['contracts', 'industry']);
  });
});

describe('soonestDeadline', () => {
  const at = (ms: number, to: string): BoardDeadline => ({
    at: ms,
    note: to,
    severity: 'watch',
    to,
  });

  it('picks the soonest clock among shown cards and the always-on extras', () => {
    const specs = [
      spec('planetary', 'ranked', 'clear', { deadline: at(300, '/pi') }),
      spec('industry', 'ranked', 'clear', { deadline: at(100, '/industry') }),
    ];
    expect(soonestDeadline(specs, showAll, [at(200, '/skills')])?.to).toBe('/industry');
  });

  it('takes nothing from a hidden or unreadable card', () => {
    const specs = [
      spec('planetary', 'ranked', 'clear', { deadline: at(100, '/pi') }),
      spec('structures', 'ranked', 'clear', { deadline: at(50, '/corp'), available: false }),
    ];
    expect(soonestDeadline(specs, (key) => key !== 'planetary', [at(200, '/skills')])?.to).toBe(
      '/skills'
    );
  });

  it('is null with no clock at all', () => {
    expect(soonestDeadline([spec('orders', 'ranked')], showAll, [])).toBeNull();
  });
});

describe('layoutBoard with the pilot’s own order', () => {
  const order: OverviewCardKey[] = ['industry', 'contracts', 'orders', 'planetary', 'mining'];

  it('lays the desktop grid out in that order, alerts still in its column', () => {
    const layout = layoutBoard(BOARD, { isPhone: false, shown: showAll, phoneFullCount: 2, order });
    expect(keys(layout.full)).toEqual(['industry', 'contracts', 'orders', 'planetary', 'mining']);
    expect(layout.column?.key).toBe('alerts');
  });

  /*
   * Chosen over urgency: once the pilot has placed their cards, the first two
   * are the full ones on a phone, whatever is on fire — including a card that
   * would otherwise always fold.
   */
  it('gives a phone’s full slots to the first cards in that order, urgency aside', () => {
    const layout = layoutBoard(BOARD, { isPhone: true, shown: showAll, phoneFullCount: 2, order });
    expect(keys(layout.full)).toEqual(['industry', 'contracts']);
    expect(keys(layout.folded)).toEqual(['alerts', 'orders', 'planetary', 'mining']);
  });

  it('skips hidden cards when filling the slots', () => {
    const layout = layoutBoard(BOARD, {
      isPhone: true,
      shown: (key) => key !== 'industry',
      phoneFullCount: 2,
      order,
    });
    expect(keys(layout.full)).toEqual(['contracts', 'orders']);
  });
});
