import { describe, expect, it } from 'vitest';
import {
  NOT_ON_MARKET,
  assetPassesKindFilter,
  blueprintKindParam,
  blueprintsTicked,
  buildCategoryIndex,
  categoryPickParam,
  headingState,
  toggleHeading,
  toggleOption,
} from './assetCategoryFilter';

const groups = [
  { id: 1, name: 'Ships', parentId: null, hasTypes: false },
  { id: 11, name: 'Frigates', parentId: 1, hasTypes: true },
  { id: 12, name: 'Cruisers', parentId: 1, hasTypes: true },
  { id: 2, name: 'Blueprints & Reactions', parentId: null, hasTypes: false },
  { id: 21, name: 'Ship Blueprints', parentId: 2, hasTypes: true },
  { id: 211, name: 'Frigate Blueprints', parentId: 21, hasTypes: true },
];
const types = [
  { typeId: 100, name: 'Rifter', marketGroupId: 11, volume: 1 },
  { typeId: 101, name: 'Maller', marketGroupId: 12, volume: 1 },
  { typeId: 200, name: 'Rifter Blueprint', marketGroupId: 211, volume: 1 },
];
const index = buildCategoryIndex(groups, types, 'Not on the market');

describe('buildCategoryIndex', () => {
  it('builds two levels with Not on the market last', () => {
    expect(index.headings.map((h) => h.name)).toEqual([
      'Blueprints & Reactions',
      'Ships',
      'Not on the market',
    ]);
    expect(index.headings[1].options.map((o) => o.name)).toEqual(['Cruisers', 'Frigates']);
  });

  it('maps a deep type to the child of its top-level group', () => {
    expect(index.optionByTypeId.get(200)).toBe(21);
  });
});

describe('picks', () => {
  it('unticking from All lists everything else; re-ticking collapses back to All', () => {
    const less = toggleOption(index, 'all', 11);
    expect(less).not.toBe('all');
    expect((less as Set<number>).has(11)).toBe(false);
    expect(toggleOption(index, less, 11)).toBe('all');
  });

  it('ticking a heading ticks its children; again clears them', () => {
    const ships = index.headings[1];
    const none = new Set<number>();
    const ticked = toggleHeading(index, none, ships) as Set<number>;
    expect([...ticked].sort()).toEqual([11, 12]);
    expect(headingState(ticked, ships)).toBe(true);
    expect(headingState(new Set([11]), ships)).toBe('mixed');
    expect((toggleHeading(index, ticked, ships) as Set<number>).size).toBe(0);
  });

  it('round-trips through the URL codec', () => {
    const codec = categoryPickParam();
    expect(codec.serialize('all')).toBeNull();
    expect(codec.parse(null)).toBe('all');
    expect(codec.parse('')).toEqual(new Set());
    expect(codec.parse(codec.serialize(new Set([12, 11])))).toEqual(new Set([11, 12]));
    expect(codec.parse('x,1')).toBe('all');
  });

  it('parses a blueprint kind, falling back to any', () => {
    const codec = blueprintKindParam();
    expect(codec.parse('copy')).toBe('copy');
    expect(codec.parse('nope')).toBe('any');
    expect(codec.serialize('any')).toBeNull();
  });
});

describe('assetPassesKindFilter', () => {
  const base = { index, pick: 'all' as const, blueprints: 'any' as const };

  it('passes everything on All, including unlisted types', () => {
    expect(assetPassesKindFilter({ type_id: 999 }, base)).toBe(true);
  });

  it('puts an unlisted type under Not on the market', () => {
    const pick = new Set([NOT_ON_MARKET]);
    expect(assetPassesKindFilter({ type_id: 999 }, { ...base, pick })).toBe(true);
    expect(assetPassesKindFilter({ type_id: 100 }, { ...base, pick })).toBe(false);
  });

  it('filters by Blueprints kind only while a blueprint option is ticked', () => {
    expect(blueprintsTicked(index, new Set([11]))).toBe(false);
    const copy = { type_id: 200, is_blueprint_copy: true };
    const original = { type_id: 200 };
    expect(assetPassesKindFilter(copy, { ...base, blueprints: 'copy' })).toBe(true);
    expect(assetPassesKindFilter(original, { ...base, blueprints: 'copy' })).toBe(false);
    expect(assetPassesKindFilter(original, { ...base, blueprints: 'original' })).toBe(true);
    expect(assetPassesKindFilter(copy, { ...base, blueprints: 'original' })).toBe(false);
    expect(assetPassesKindFilter({ type_id: 100 }, { ...base, blueprints: 'original' })).toBe(
      false
    );
    const noBp = { ...base, pick: new Set([11]), blueprints: 'copy' as const };
    expect(assetPassesKindFilter({ type_id: 100 }, noBp)).toBe(true);
  });
});
