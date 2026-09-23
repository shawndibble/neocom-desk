import { describe, it, expect } from 'vitest';
import {
  boolParam,
  defineUrlFilter,
  enumParam,
  enumSetParam,
  idListParam,
  intParam,
  isoDateParam,
  nullableTextParam,
  optionalEnumParam,
  optionalIdParam,
  optionalSortParam,
  resolveSort,
  sortParam,
  textParam,
} from './urlState';

describe('textParam', () => {
  const codec = textParam();

  it('omits the default (empty) value', () => {
    expect(codec.serialize('')).toBeNull();
    expect(codec.parse(null)).toBe('');
  });

  it('round-trips any other text', () => {
    expect(codec.parse(codec.serialize('Inferno Cruise Missile Blueprint'))).toBe(
      'Inferno Cruise Missile Blueprint'
    );
  });

  it('debounces by default, so typing replaces the URL once per pause', () => {
    expect(codec.debounceMs).toBeGreaterThan(0);
  });
});

describe('nullableTextParam', () => {
  const codec = nullableTextParam();

  it('omits the default (absent) value', () => {
    expect(codec.serialize(null)).toBeNull();
    expect(codec.parse(null)).toBeNull();
  });

  it('round-trips any other text verbatim', () => {
    expect(codec.parse(codec.serialize('bounty_prize'))).toBe('bounty_prize');
  });

  it('does not debounce — a click, not typing, sets this kind of value', () => {
    expect(codec.debounceMs).toBeUndefined();
  });
});

describe('intParam', () => {
  const codec = intParam(10);

  it('falls back to the default for garbage', () => {
    expect(codec.parse('abc')).toBe(10);
    expect(codec.parse('1.5')).toBe(10);
    expect(codec.parse('')).toBe(10);
    expect(codec.parse(null)).toBe(10);
  });

  it('parses integers, negatives included', () => {
    expect(codec.parse('42')).toBe(42);
    expect(codec.parse('-3')).toBe(-3);
  });

  it('honours bounds', () => {
    const bounded = intParam(1, { min: 1, max: 5 });
    expect(bounded.parse('0')).toBe(1);
    expect(bounded.parse('6')).toBe(1);
    expect(bounded.parse('5')).toBe(5);
  });

  it('omits the default', () => {
    expect(codec.serialize(10)).toBeNull();
    expect(codec.serialize(7)).toBe('7');
  });
});

describe('boolParam', () => {
  it('writes only the non-default side', () => {
    const codec = boolParam();
    expect(codec.serialize(false)).toBeNull();
    expect(codec.serialize(true)).toBe('1');
    expect(codec.parse('1')).toBe(true);
    expect(codec.parse('0')).toBe(false);
    expect(codec.parse('yes')).toBe(false);
  });

  it('supports a true default', () => {
    const codec = boolParam(true);
    expect(codec.serialize(true)).toBeNull();
    expect(codec.serialize(false)).toBe('0');
    expect(codec.parse(null)).toBe(true);
    expect(codec.parse('0')).toBe(false);
  });
});

describe('enumParam', () => {
  const codec = enumParam(['hub', 'region'] as const, 'hub');

  it('accepts only declared members', () => {
    expect(codec.parse('region')).toBe('region');
    expect(codec.parse('planet')).toBe('hub');
    expect(codec.parse(null)).toBe('hub');
  });

  it('omits the default', () => {
    expect(codec.serialize('hub')).toBeNull();
    expect(codec.serialize('region')).toBe('region');
  });
});

describe('optionalEnumParam', () => {
  const codec = optionalEnumParam(['outstanding', 'finished'] as const);

  it('defaults to null and omits it from the URL', () => {
    expect(codec.parse(null)).toBeNull();
    expect(codec.serialize(null)).toBeNull();
  });

  it('accepts only declared members', () => {
    expect(codec.parse('finished')).toBe('finished');
    expect(codec.parse('bogus')).toBeNull();
  });

  it('round-trips a non-null member', () => {
    expect(codec.serialize('outstanding')).toBe('outstanding');
  });
});

describe('idListParam', () => {
  const codec = idListParam();

  it('parses positive ids, sorted and de-duplicated', () => {
    expect(codec.parse('3,1,3')).toEqual([1, 3]);
  });

  it('drops the whole list on any garbage entry', () => {
    expect(codec.parse('1,x')).toEqual([]);
    expect(codec.parse('1,-2')).toEqual([]);
    expect(codec.parse('1,0')).toEqual([]);
  });

  it('omits an empty list', () => {
    expect(codec.serialize([])).toBeNull();
    expect(codec.serialize([5, 2])).toBe('2,5');
  });
});

describe('enumSetParam', () => {
  const all = ['character', 'corporation', 'alliance'] as const;
  const codec = enumSetParam(all);

  it('defaults to every member and omits that from the URL', () => {
    expect([...codec.parse(null)]).toEqual([...all]);
    expect(codec.serialize(new Set(all))).toBeNull();
  });

  it('writes a subset in declaration order, regardless of insertion order', () => {
    expect(codec.serialize(new Set(['alliance', 'character'] as const))).toBe('character,alliance');
  });

  it('keeps an empty set distinct from the default', () => {
    expect(codec.serialize(new Set())).toBe('');
    expect(codec.parse('').size).toBe(0);
  });

  it('falls back to the default on an unknown member', () => {
    expect([...codec.parse('character,planet')]).toEqual([...all]);
  });
});

describe('sortParam', () => {
  const defaultSort = { columnId: 'standing', direction: 'desc' } as const;
  const codec = sortParam(defaultSort);

  it('omits the default sort', () => {
    expect(codec.serialize(defaultSort)).toBeNull();
    expect(codec.parse(null)).toEqual(defaultSort);
  });

  it('round-trips a column id containing a colon', () => {
    const sort = { columnId: 'a:b', direction: 'asc' } as const;
    expect(codec.parse(codec.serialize(sort))).toEqual(sort);
  });

  it('falls back to the default for garbage', () => {
    expect(codec.parse('standing')).toEqual(defaultSort);
    expect(codec.parse('standing:sideways')).toEqual(defaultSort);
    expect(codec.parse(':asc')).toEqual(defaultSort);
  });
});

describe('resolveSort', () => {
  const defaultSort = { columnId: 'standing', direction: 'desc' } as const;

  it('keeps a sort on a known column', () => {
    const sort = { columnId: 'name', direction: 'asc' } as const;
    expect(resolveSort(sort, defaultSort, ['name', 'standing'])).toBe(sort);
  });

  it('replaces a sort on an unknown column with the default', () => {
    expect(
      resolveSort({ columnId: 'bogus', direction: 'asc' }, defaultSort, ['name', 'standing'])
    ).toBe(defaultSort);
  });
});

describe('optionalIdParam', () => {
  const codec = optionalIdParam();

  it('parses one positive id, or null', () => {
    expect(codec.parse('638')).toBe(638);
    expect(codec.parse(null)).toBeNull();
    expect(codec.parse('0')).toBeNull();
    expect(codec.parse('-4')).toBeNull();
    expect(codec.parse('12x')).toBeNull();
  });

  it('omits null', () => {
    expect(codec.serialize(null)).toBeNull();
    expect(codec.serialize(638)).toBe('638');
  });

  it('round-trips a positive id', () => {
    expect(codec.parse(codec.serialize(30000142))).toBe(30000142);
  });
});

describe('isoDateParam', () => {
  const codec = isoDateParam();

  it('parses a real YYYY-MM-DD day, or null', () => {
    expect(codec.parse('2026-09-01')).toBe('2026-09-01');
    expect(codec.parse(null)).toBeNull();
    expect(codec.parse('2026-9-1')).toBeNull();
    expect(codec.parse('2026-02-30')).toBeNull();
    expect(codec.parse('yesterday')).toBeNull();
  });

  it('omits null', () => {
    expect(codec.serialize(null)).toBeNull();
    expect(codec.serialize('2026-09-01')).toBe('2026-09-01');
  });
});

describe('optionalSortParam', () => {
  const codec = optionalSortParam();

  it('reads absent or garbage as unsorted', () => {
    expect(codec.parse(null)).toBeNull();
    expect(codec.parse('item')).toBeNull();
    expect(codec.parse('item:sideways')).toBeNull();
  });

  it('round-trips a sort and omits unsorted', () => {
    const sort = { columnId: 'realizedProfit', direction: 'desc' } as const;
    expect(codec.parse(codec.serialize(sort))).toEqual(sort);
    expect(codec.serialize(null)).toBeNull();
  });
});

interface TestFilter {
  side: 'buy' | 'sell' | null;
  q: string;
  hideHealthy: boolean;
}

describe('defineUrlFilter', () => {
  const { schema, fieldToParam, emptyParams } = defineUrlFilter<TestFilter>({
    side: { key: 'orders.side', codec: optionalEnumParam<'buy' | 'sell'>(['buy', 'sell']) },
    q: { key: 'orders.q', codec: textParam() },
    hideHealthy: { key: 'orders.hideHealthy', codec: boolParam(true) },
  });

  it('keys the schema by each field’s given key', () => {
    expect(Object.keys(schema).sort()).toEqual(['orders.hideHealthy', 'orders.q', 'orders.side']);
  });

  it('maps each field to its given key', () => {
    expect(fieldToParam).toEqual({
      side: 'orders.side',
      q: 'orders.q',
      hideHealthy: 'orders.hideHealthy',
    });
  });

  it('derives empty params from each codec parsing absence, not a hand-typed guess', () => {
    expect(emptyParams).toEqual({
      'orders.side': null,
      'orders.q': '',
      // boolParam(true)'s own default, not `false` — the point of deriving
      // this instead of writing it by hand.
      'orders.hideHealthy': true,
    });
  });

  it('keeps a key that deliberately differs from its field name', () => {
    interface AbbreviatedFilter {
      text: string;
    }
    const abbreviated = defineUrlFilter<AbbreviatedFilter>({
      text: { key: 'journal.q', codec: textParam() },
    });
    expect(abbreviated.schema).toHaveProperty('journal.q');
    expect(abbreviated.schema).not.toHaveProperty('journal.text');
    expect(abbreviated.fieldToParam).toEqual({ text: 'journal.q' });
  });
});
