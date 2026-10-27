import { describe, expect, it } from 'vitest';
import { displayAttributeValue, displaySourceValue } from './attributeUnits';

describe('displayAttributeValue', () => {
  it('shows milliseconds as seconds', () => {
    // A large turret's Rate of fire (unit 101): 12000 ms.
    expect(displayAttributeValue(12000, 101, 's')).toEqual({ value: 12, unit: 's' });
    expect(displayAttributeValue(9760, 101, 's').value).toBeCloseTo(9.76, 9);
  });

  it('shows a resonance (inverse absolute percent) as the resistance it is', () => {
    expect(displayAttributeValue(0.5, 108, '%')).toEqual({ value: 50, unit: '%' });
    expect(displayAttributeValue(0.75, 108, '%').value).toBeCloseTo(25, 9);
    expect(displayAttributeValue(0.9, 111, '%').value).toBeCloseTo(10, 9);
  });

  it('shows a modifier percent as the change it makes', () => {
    expect(displayAttributeValue(1.1, 109, '%').value).toBeCloseTo(10, 9);
  });

  it('shows an absolute percent (a share) as a percentage', () => {
    // Mining critical success chance, 0.01.
    expect(displayAttributeValue(0.01, 127, '%').value).toBeCloseTo(1, 9);
  });

  it('leaves a value already in percent, a multiplier or a length as it is', () => {
    // Target Painter II signature radius bonus (124), a disruptor's 105, a crystal's 121.
    expect(displayAttributeValue(30, 124, '%')).toEqual({ value: 30, unit: '%' });
    expect(displayAttributeValue(-17.19, 105, '%')).toEqual({ value: -17.19, unit: '%' });
    expect(displayAttributeValue(34, 121, '%')).toEqual({ value: 34, unit: '%' });
    expect(displayAttributeValue(2.5, 104, 'x')).toEqual({ value: 2.5, unit: 'x' });
    expect(displayAttributeValue(48000, 1, 'm')).toEqual({ value: 48000, unit: 'm' });
  });

  it('leaves a value with no known unit as it is', () => {
    expect(displayAttributeValue(3, undefined, null)).toEqual({ value: 3, unit: null });
  });
});

describe('displaySourceValue', () => {
  it('converts an assigned value the way the attribute is shown', () => {
    expect(displaySourceValue('post_assign', 5000, 101)).toBe(5);
    expect(displaySourceValue('pre_assign', 0.5, 108)).toBe(50);
  });

  it('scales an added or subtracted amount by the unit', () => {
    expect(displaySourceValue('mod_add', 500, 101)).toBe(0.5);
    expect(displaySourceValue('mod_sub', 0.02, 127)).toBeCloseTo(2, 9);
  });

  it('leaves a percentage or a multiplier — its own unit, not the attribute’s — alone', () => {
    expect(displaySourceValue('post_percent', 15, 101)).toBe(15);
    expect(displaySourceValue('pre_mul', 1.1, 101)).toBe(1.1);
    expect(displaySourceValue('post_div', 2, 108)).toBe(2);
  });
});
