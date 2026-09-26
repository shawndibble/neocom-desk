import { describe, expect, it } from 'vitest';
import { affectedAttributes, type SourceLike } from './affectedBy';

function source(from: SourceLike['from'], overrides: Partial<SourceLike> = {}): SourceLike {
  return {
    from,
    effect_id: 1,
    source_attribute_id: 2,
    operator: 'post_percent',
    value: 10,
    quantity: 1,
    penalty: undefined,
    applied: true,
    ...overrides,
  };
}

const context = {
  shipTypeId: 587,
  itemTypeIds: [2889, 2048],
  chargeTypeIds: [12608, undefined],
  projectedTypeIds: [47390],
};

describe('affectedAttributes', () => {
  it('lists only the attributes something changed, each source named by what it is', () => {
    const attributes = new Map([
      [
        54,
        {
          base: 1200,
          value: 1500,
          sources: [
            source({ type: 'skill', type_id: 3300 }),
            source({ type: 'ship' }, { operator: 'post_mul', value: 1.25 }),
            source({ type: 'charge', index: 0 }, { operator: 'pre_mul', value: 0.5 }),
            source({ type: 'item', index: 1 }, { penalty: 0.869, applied: false }),
            source({ type: 'projected', index: 0 }),
            source(
              { type: 'buff', id: 12 },
              { effect_id: undefined, source_attribute_id: undefined }
            ),
            source({ type: 'character' }),
          ],
        },
      ],
      // Unchanged: no sources worth listing.
      [158, { base: 5000, value: 5000, sources: [] }],
      // A patched (derived) attribute: never listed.
      [-12, { base: 0, value: 40, sources: [source({ type: 'item', index: 0 })] }],
    ]);

    expect(affectedAttributes(attributes, context)).toEqual([
      {
        attributeId: 54,
        base: 1200,
        value: 1500,
        sources: [
          {
            kind: 'skill',
            typeId: 3300,
            operator: 'post_percent',
            value: 10,
            penalty: null,
            applied: true,
          },
          {
            kind: 'ship',
            typeId: 587,
            operator: 'post_mul',
            value: 1.25,
            penalty: null,
            applied: true,
          },
          {
            kind: 'charge',
            typeId: 12608,
            operator: 'pre_mul',
            value: 0.5,
            penalty: null,
            applied: true,
          },
          {
            kind: 'item',
            typeId: 2048,
            operator: 'post_percent',
            value: 10,
            penalty: 0.869,
            applied: false,
          },
          {
            kind: 'projected',
            typeId: 47390,
            operator: 'post_percent',
            value: 10,
            penalty: null,
            applied: true,
          },
          {
            kind: 'buff',
            typeId: null,
            buffId: 12,
            operator: 'post_percent',
            value: 10,
            penalty: null,
            applied: true,
          },
          {
            kind: 'character',
            typeId: null,
            operator: 'post_percent',
            value: 10,
            penalty: null,
            applied: true,
          },
        ],
      },
    ]);
  });

  it('keeps an attribute a source touched even when it nets back to its base', () => {
    const attributes = new Map([
      [54, { base: 100, value: 100, sources: [source({ type: 'ship' })] }],
    ]);
    expect(affectedAttributes(attributes, context)).toHaveLength(1);
  });
});
