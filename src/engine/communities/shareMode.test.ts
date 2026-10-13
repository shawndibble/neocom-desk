import { describe, expect, it } from 'vitest';
import {
  addShared,
  copiesByPlace,
  noBlueprintsShared,
  noneShared,
  shareAll,
  shareAllBlueprints,
  sharesBlueprint,
  shareLocation,
  shareType,
  stopSharing,
  stopSharingLocation,
  stopSharingType,
  typeShareStatus,
  type BlueprintShare,
  type ShareChoice,
} from './shareMode';

describe('stopSharing and addShared', () => {
  it('revoking under share-all adds an exclusion', () => {
    const next = stopSharing(shareAll(), 20);
    expect(next).toEqual({ all: true, excluded: new Set([20]) });
  });

  it('revoking when not sharing all drops the allowed entry', () => {
    const next = stopSharing({ all: false, allowed: new Set([10, 20]) }, 20);
    expect(next).toEqual({ all: false, allowed: new Set([10]) });
  });

  it('adding under share-all lifts the exclusion', () => {
    const next = addShared({ all: true, excluded: new Set([20, 30]) }, 20);
    expect(next).toEqual({ all: true, excluded: new Set([30]) });
  });

  it('adding when not sharing all grows the allowed set', () => {
    expect(addShared(noneShared(), 10)).toEqual({ all: false, allowed: new Set([10]) });
  });

  it('does not mutate the choice it was given', () => {
    const before: ShareChoice = { all: false, allowed: new Set([10]) };
    addShared(before, 20);
    expect(before).toEqual({ all: false, allowed: new Set([10]) });
  });
});

describe('a choice over string keys (Fittings)', () => {
  it('revokes and re-adds by key under share-all', () => {
    const stopped = stopSharing<string>(shareAll<string>(), 'saved-a');
    expect(stopped).toEqual({ all: true, excluded: new Set(['saved-a']) });
    expect(addShared(stopped, 'saved-a')).toEqual(shareAll<string>());
  });
});

describe('sharing blueprints by location', () => {
  const allow = (...ids: number[]): BlueprintShare => ({
    choice: { all: false, allowed: new Set(ids) },
    locations: new Set(),
  });

  it('shares a copy whose type is allowed, wherever it is', () => {
    expect(sharesBlueprint(allow(10), 10, 500)).toBe(true);
    expect(sharesBlueprint(allow(10), 10, null)).toBe(true);
    expect(sharesBlueprint(allow(10), 20, 500)).toBe(false);
  });

  it('shares every copy at a shared location, whatever its type', () => {
    const share = shareLocation(allow(), 500);
    expect(sharesBlueprint(share, 20, 500)).toBe(true);
    expect(sharesBlueprint(share, 20, 600)).toBe(false);
  });

  it('never matches a location rule for a copy with no known place', () => {
    expect(sharesBlueprint(shareLocation(allow(), 500), 20, null)).toBe(false);
  });

  it('ignores location rules under share-all: everything not stopped is shared', () => {
    const share: BlueprintShare = {
      choice: { all: true, excluded: new Set([20]) },
      locations: new Set([500]),
    };
    expect(sharesBlueprint(share, 10, 600)).toBe(true);
    expect(sharesBlueprint(share, 20, 500)).toBe(false);
  });

  it('includes a blueprint acquired after share-all was turned on', () => {
    expect(sharesBlueprint(shareAllBlueprints(), 40, null)).toBe(true);
  });

  it('shares and stops one type without touching the location rules', () => {
    const share = shareLocation(allow(), 500);
    expect(shareType(share, 10)).toEqual(shareLocation(allow(10), 500));
    expect(stopSharingType(shareLocation(allow(10), 500), 10)).toEqual(share);
  });

  it('stops a type under share-all as an exclusion', () => {
    expect(stopSharingType(shareAllBlueprints(), 20).choice).toEqual({
      all: true,
      excluded: new Set([20]),
    });
  });

  it('stops a location rule without touching the types', () => {
    const share = stopSharingLocation(shareLocation(allow(10), 500), 500);
    expect(share).toEqual(allow(10));
  });

  it('starts share-all and stop-all with no location rules', () => {
    expect(shareAllBlueprints()).toEqual({ choice: shareAll(), locations: new Set() });
    expect(noBlueprintsShared()).toEqual({ choice: noneShared(), locations: new Set() });
  });

  describe('typeShareStatus', () => {
    const copies = [
      { typeId: 10, placeId: 500 },
      { typeId: 10, placeId: 600 },
      { typeId: 20, placeId: 500 },
      { typeId: 30, placeId: null },
    ];

    it('says which types are shared directly and which shared locations hold them', () => {
      const share = { ...shareLocation(shareLocation(allow(30), 600), 500) };
      const status = typeShareStatus(copies, share);
      expect(status.get(10)).toEqual({ direct: false, via: [500, 600] });
      expect(status.get(20)).toEqual({ direct: false, via: [500] });
      expect(status.get(30)).toEqual({ direct: true, via: [] });
    });

    it('lists no locations under share-all', () => {
      const share: BlueprintShare = {
        choice: { all: true, excluded: new Set([20]) },
        locations: new Set([500]),
      };
      const status = typeShareStatus(copies, share);
      expect(status.get(10)).toEqual({ direct: true, via: [] });
      expect(status.get(20)).toEqual({ direct: false, via: [] });
    });
  });

  it('counts the copies at each place, leaving out copies with no known place', () => {
    expect(
      copiesByPlace([
        { typeId: 10, placeId: 500 },
        { typeId: 20, placeId: 500 },
        { typeId: 30, placeId: 600 },
        { typeId: 40, placeId: null },
      ])
    ).toEqual(
      new Map([
        [500, 2],
        [600, 1],
      ])
    );
  });
});
