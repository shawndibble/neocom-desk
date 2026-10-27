import { describe, expect, it } from 'vitest';
import type { Widget } from './layout';
import { distinctKinds, visibleWidgets } from './visibility';

const w = (id: string, kind: string, showOnPhone = true): Widget => ({
  id,
  kind,
  size: 'S',
  view: 'number',
  scope: 'header',
  showOnPhone,
});

describe('visibleWidgets', () => {
  const layout = [
    w('a', 'wallet'),
    w('b', 'mail', false),
    w('c', 'fromTheFuture'),
    w('d', 'wallet'),
  ];

  it('drops kinds this build does not know, in order, keeping duplicates of a kind', () => {
    expect(visibleWidgets(layout, false).map((x) => x.id)).toEqual(['a', 'b', 'd']);
  });

  it('also drops widgets hidden on a phone, on a phone only', () => {
    expect(visibleWidgets(layout, true).map((x) => x.id)).toEqual(['a', 'd']);
  });
});

describe('distinctKinds', () => {
  it('lists each kind once, in first-seen order', () => {
    expect(distinctKinds([w('a', 'wallet'), w('b', 'mail'), w('c', 'wallet')])).toEqual([
      'wallet',
      'mail',
    ]);
  });
});
