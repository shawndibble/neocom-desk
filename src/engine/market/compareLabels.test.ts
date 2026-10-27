import { describe, expect, it } from 'vitest';
import { shortCompareLabels } from './compareLabels';

describe('shortCompareLabels', () => {
  it('strips the words every name shares and returns them as the shared caption', () => {
    expect(
      shortCompareLabels([
        'Large Shield Extender II',
        'Republic Fleet Large Shield Extender',
        'Caldari Navy Large Shield Extender',
        'Large Azeotropic Restrained Shield Extender',
        'Large Shield Extender I',
      ])
    ).toEqual({
      shared: 'Large Shield Extender',
      labels: ['II', 'Republic Fleet', 'Caldari Navy', 'Azeotropic Restrained', 'I'],
    });
  });

  it('keeps the full names when nothing is shared', () => {
    expect(shortCompareLabels(['Tritanium', 'Pyerite'])).toEqual({
      shared: null,
      labels: ['Tritanium', 'Pyerite'],
    });
  });

  it('keeps the full names when stripping would leave a name empty', () => {
    expect(shortCompareLabels(['Large Shield Extender', 'Large Shield Extender II'])).toEqual({
      shared: null,
      labels: ['Large Shield Extender', 'Large Shield Extender II'],
    });
  });

  it('keeps the full name of a single item — there is nothing to compare it against', () => {
    expect(shortCompareLabels(['Large Shield Extender II'])).toEqual({
      shared: null,
      labels: ['Large Shield Extender II'],
    });
  });

  it('strips a repeated shared word only as often as every name repeats it', () => {
    expect(shortCompareLabels(['Mega Mega Pulse', 'Mega Beam'])).toEqual({
      shared: 'Mega',
      labels: ['Mega Pulse', 'Beam'],
    });
  });

  it('matches words case-sensitively, as the SDE spells them', () => {
    expect(shortCompareLabels(['Small Gun', 'small Gun Mk2'])).toEqual({
      shared: 'Gun',
      labels: ['Small', 'small Mk2'],
    });
  });
});
