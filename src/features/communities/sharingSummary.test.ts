import { describe, expect, it } from 'vitest';
import { blueprintSharing, fittingSharing, planSharing } from './sharingSummary';

describe('blueprintSharing', () => {
  it('is all under share-all, whatever was stopped since', () => {
    expect(
      blueprintSharing({ choice: { all: true, excluded: new Set([1]) }, locations: new Set() })
    ).toEqual({ kind: 'all' });
  });

  it('counts the picked blueprints and the shared locations', () => {
    expect(
      blueprintSharing({
        choice: { all: false, allowed: new Set([1, 2, 3]) },
        locations: new Set([60003760, 60008494]),
      })
    ).toEqual({ kind: 'some', picked: 3, places: 2 });
  });

  it('is none when nothing is picked and no location is shared', () => {
    expect(
      blueprintSharing({ choice: { all: false, allowed: new Set() }, locations: new Set() })
    ).toEqual({ kind: 'none' });
  });
});

describe('fittingSharing', () => {
  it('is all while the share-all switch is on', () => {
    expect(fittingSharing(true, 4)).toEqual({ kind: 'all' });
    expect(fittingSharing(true, null)).toEqual({ kind: 'all' });
  });

  it('is unknown until the shared list has loaded', () => {
    expect(fittingSharing(false, null)).toBeNull();
  });

  it('counts what this Character shares, none at zero', () => {
    expect(fittingSharing(false, 2)).toEqual({ kind: 'count', count: 2 });
    expect(fittingSharing(false, 0)).toEqual({ kind: 'none' });
  });
});

describe('planSharing', () => {
  it('counts the shared plans once the list has loaded', () => {
    expect(planSharing(null)).toBeNull();
    expect(planSharing(0)).toEqual({ kind: 'none' });
    expect(planSharing(3)).toEqual({ kind: 'count', count: 3 });
  });
});
