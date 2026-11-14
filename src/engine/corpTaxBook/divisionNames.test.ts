import { describe, expect, it } from 'vitest';
import { divisionNamesToPush, readDivisionNames } from './divisionNames';

describe('readDivisionNames', () => {
  it('keeps divisions 1-7 with a non-empty name, by number', () => {
    expect(readDivisionNames({ '1': 'Master', '5': ' MOON TAXES ' })).toEqual({
      1: 'Master',
      5: 'MOON TAXES',
    });
  });

  it('drops garbage and tolerates absence', () => {
    expect(readDivisionNames(undefined)).toEqual({});
    expect(readDivisionNames(['x'])).toEqual({});
    expect(readDivisionNames('x')).toEqual({});
    expect(readDivisionNames({ '0': 'a', '8': 'b', x: 'c', '2': '  ', '3': 4 })).toEqual({});
  });
});

describe('divisionNamesToPush (#6161)', () => {
  const read = [
    { division: 1, name: 'Master Wallet' },
    { division: 5, name: ' MOON TAXES ' },
    { division: 6 },
  ];

  it("pushes the names of the book's divisions when the book has none", () => {
    expect(divisionNamesToPush([5], {}, read)).toEqual({ 5: 'MOON TAXES' });
    expect(divisionNamesToPush([1, 5], {}, read)).toEqual({ 1: 'Master Wallet', 5: 'MOON TAXES' });
  });

  it('pushes nothing when the book already holds the same names', () => {
    expect(divisionNamesToPush([5], { 5: 'MOON TAXES' }, read)).toBeNull();
    expect(divisionNamesToPush([6], {}, read)).toBeNull();
  });

  it('pushes a renamed division, and drops a name the corp cleared or no longer collects into', () => {
    expect(divisionNamesToPush([5], { 5: 'Old' }, read)).toEqual({ 5: 'MOON TAXES' });
    expect(divisionNamesToPush([6], { 6: 'Gone' }, read)).toEqual({});
    expect(divisionNamesToPush([5], { 2: 'Other', 5: 'MOON TAXES' }, read)).toEqual({
      5: 'MOON TAXES',
    });
  });

  it('leaves out a name too long for the book rather than cut it', () => {
    expect(divisionNamesToPush([2], {}, [{ division: 2, name: 'x'.repeat(51) }])).toBeNull();
  });
});
