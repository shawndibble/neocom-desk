import { describe, expect, it } from 'vitest';
import { enumUnitLabel, idReferenceKind, isEnumUnit } from './attributeUnits';

describe('isEnumUnit', () => {
  it('recognises a legend regardless of how many members it lists', () => {
    expect(isEnumUnit('1=True 0=False')).toBe(true);
    expect(isEnumUnit('1=small 2=medium 3=l')).toBe(true);
    expect(isEnumUnit('1=Male 2=Unisex 3=Female')).toBe(true);
  });

  it('leaves real units alone', () => {
    for (const unit of ['HP', 'm/sec', 'm3', 'tf', 'GJ', 'AU/s', 'm3/hour', 'x', '%', '+', '']) {
      expect(isEnumUnit(unit), unit).toBe(false);
    }
  });

  it('treats a missing unit as not a legend', () => {
    expect(isEnumUnit(null)).toBe(false);
    expect(isEnumUnit(undefined)).toBe(false);
  });
});

describe('enumUnitLabel', () => {
  it('resolves a boolean legend to its member', () => {
    expect(enumUnitLabel('1=True 0=False', 1)).toBe('True');
    expect(enumUnitLabel('1=True 0=False', 0)).toBe('False');
  });

  it('resolves a gender legend to its member', () => {
    expect(enumUnitLabel('1=Male 2=Unisex 3=Female', 1)).toBe('Male');
    expect(enumUnitLabel('1=Male 2=Unisex 3=Female', 2)).toBe('Unisex');
    expect(enumUnitLabel('1=Male 2=Unisex 3=Female', 3)).toBe('Female');
  });

  it('capitalises members the SDE stores lower case', () => {
    expect(enumUnitLabel('1=small 2=medium 3=l', 1)).toBe('Small');
    expect(enumUnitLabel('1=small 2=medium 3=l', 2)).toBe('Medium');
  });

  it('repairs the size legend the SDE ships truncated mid-word', () => {
    expect(enumUnitLabel('1=small 2=medium 3=l', 3)).toBe('Large');
  });

  it('parses an untruncated legend on its own, without needing a repair entry', () => {
    expect(enumUnitLabel('1=small 2=medium 3=large 4=x-large', 4)).toBe('X-large');
  });

  it('keeps multi-word members whole', () => {
    const legend = '1=Low power 2=Medium power 3=High power';
    expect(enumUnitLabel(legend, 1)).toBe('Low power');
    expect(enumUnitLabel(legend, 3)).toBe('High power');
  });

  it('matches a whole-number float, since ESI sends dogma values as floats', () => {
    expect(enumUnitLabel('1=True 0=False', 1.0)).toBe('True');
  });

  it('returns null for a value the legend does not list, rather than inventing one', () => {
    // charge size 4 (XL) is real and outside the legend's 1-3.
    expect(enumUnitLabel('1=small 2=medium 3=l', 4)).toBeNull();
    expect(enumUnitLabel('1=True 0=False', 2)).toBeNull();
    expect(enumUnitLabel('1=True 0=False', 0.5)).toBeNull();
  });

  it('returns null for a real unit', () => {
    expect(enumUnitLabel('HP', 1)).toBeNull();
    expect(enumUnitLabel(null, 1)).toBeNull();
  });
});

describe('idReferenceKind', () => {
  it('classifies each of the three id-reference units', () => {
    expect(idReferenceKind('typeID')).toBe('type');
    expect(idReferenceKind('groupID')).toBe('group');
    expect(idReferenceKind('attributeID')).toBe('attribute');
  });

  it('leaves real units alone', () => {
    for (const unit of ['HP', 'm/sec', 'm3', 'points', 'Level', 'Slot', 'x', '%', '']) {
      expect(idReferenceKind(unit), unit).toBeNull();
    }
  });

  it('treats a missing unit as no reference', () => {
    expect(idReferenceKind(null)).toBeNull();
    expect(idReferenceKind(undefined)).toBeNull();
  });

  it('stays disjoint from the enum-legend units, so neither path claims the other', () => {
    for (const unit of ['typeID', 'groupID', 'attributeID']) {
      expect(isEnumUnit(unit), unit).toBe(false);
    }
    for (const legend of ['1=True 0=False', '1=small 2=medium 3=l', '1=Male 2=Unisex 3=Female']) {
      expect(idReferenceKind(legend), legend).toBeNull();
    }
  });
});
