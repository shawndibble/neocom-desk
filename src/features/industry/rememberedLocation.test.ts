import { describe, expect, it } from 'vitest';
import { parseRememberedLocation, sameRememberedRecord } from './rememberedLocation';

describe('parseRememberedLocation', () => {
  it('keeps a whole, well-formed location', () => {
    expect(
      parseRememberedLocation({
        security: 'nullsec',
        buildSystemId: 30003888,
        buildSystemName: 'Badivefi',
        buildLocationId: 1035466617946,
        buildLocationName: 'Badivefi - K2-18 b R&D',
      })
    ).toEqual({
      security: 'nullsec',
      buildSystemId: 30003888,
      buildSystemName: 'Badivefi',
      buildLocationId: 1035466617946,
      buildLocationName: 'Badivefi - K2-18 b R&D',
    });
  });

  it('reads a record from before locations were remembered as no location at all', () => {
    // Absent keys, not `undefined` ones: the record syncs through Firestore,
    // which rejects `undefined` at any depth.
    const parsed = parseRememberedLocation({ facility: 'azbel' });
    expect(parsed).toEqual({});
    expect('security' in parsed).toBe(false);
  });

  it('drops a malformed field on its own rather than the rest of the location', () => {
    expect(
      parseRememberedLocation({
        security: 'wormhole',
        buildSystemId: 30003888,
        buildSystemName: 'Badivefi',
      })
    ).toEqual({ buildSystemId: 30003888, buildSystemName: 'Badivefi' });
  });

  it('keeps the build system only as a whole pair', () => {
    // A plan holding half the pair builds at its hub, so a remembered half
    // would seed a plan whose label and fee disagree.
    expect(parseRememberedLocation({ buildSystemId: 30003888 })).toEqual({});
    expect(parseRememberedLocation({ buildSystemId: 'x', buildSystemName: 'Badivefi' })).toEqual(
      {}
    );
  });

  it('keeps a picked place with no name — ESI withholds some — but not a name with no place', () => {
    expect(parseRememberedLocation({ buildLocationId: 1035466617946 })).toEqual({
      buildLocationId: 1035466617946,
    });
    expect(parseRememberedLocation({ buildLocationName: 'Somewhere' })).toEqual({});
  });

  it.each([
    ['a fractional system id', { buildSystemId: 1.5, buildSystemName: 'X' }],
    ['a negative location id', { buildLocationId: -1 }],
    ['an empty system name', { buildSystemId: 30003888, buildSystemName: '' }],
  ])('drops %s', (_label, raw) => {
    expect(parseRememberedLocation(raw)).toEqual({});
  });
});

describe('parseRememberedLocation — the plan-page marker', () => {
  it('keeps the marker a plan page writes', () => {
    expect(parseRememberedLocation({ setOnPlanPage: true })).toEqual({ setOnPlanPage: true });
  });

  it('drops anything but `true`, so an old record stays unmarked', () => {
    expect(parseRememberedLocation({ setOnPlanPage: 'yes' })).toEqual({});
    expect(parseRememberedLocation({ setOnPlanPage: false })).toEqual({});
  });
});

describe('sameRememberedRecord', () => {
  it('matches equal records whatever order their keys were written in', () => {
    expect(
      sameRememberedRecord(
        { facility: 'azbel', rigFit: ['meT1', 'none', 'none'], buildSystemId: 1 },
        { buildSystemId: 1, rigFit: ['meT1', 'none', 'none'], facility: 'azbel' }
      )
    ).toBe(true);
  });

  it('tells apart a changed field, an added one and a reordered rig fit', () => {
    const base = { facility: 'azbel', rigFit: ['meT1', 'none', 'none'] };
    expect(sameRememberedRecord(base, { ...base, facility: 'raitaru' })).toBe(false);
    expect(sameRememberedRecord(base, { ...base, setOnPlanPage: true })).toBe(false);
    expect(sameRememberedRecord(base, { ...base, rigFit: ['none', 'meT1', 'none'] })).toBe(false);
  });
});
