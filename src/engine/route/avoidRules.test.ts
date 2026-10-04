import { describe, expect, it } from 'vitest';
import { avoidListKey, candidateAvoid, effectiveAvoid, type AvoidRules } from './avoidRules';

const UEDAMA = 30045328;
const TAMA = 30002813;
const EDENCOM_A = 30000001;
const TRIG_A = 30000002;
const PODDED = 30000003;

const OFF: AvoidRules = {
  avoidList: [],
  avoidListEnabled: true,
  avoidEdencom: false,
  edencomSystems: [EDENCOM_A],
  avoidTriglavian: false,
  triglavianSystems: [TRIG_A],
  avoidPodKills: false,
  podKillThreshold: 3,
  podKillsBySystem: new Map([[PODDED, 5]]),
};

describe('effectiveAvoid', () => {
  it('is the pilot list when nothing else is on', () => {
    expect(effectiveAvoid({ ...OFF, avoidList: [UEDAMA, TAMA] })).toEqual([UEDAMA, TAMA].sort());
  });

  /*
   * The toggle is the point of keeping the list: switching it off must route
   * straight through those systems without the pilot losing what they entered.
   */
  it('leaves the pilot list out while it is switched off', () => {
    expect(effectiveAvoid({ ...OFF, avoidList: [UEDAMA], avoidListEnabled: false })).toEqual([]);
  });

  it('adds EDENCOM and Triglavian systems only when asked', () => {
    expect(effectiveAvoid({ ...OFF, avoidEdencom: true })).toEqual([EDENCOM_A]);
    expect(effectiveAvoid({ ...OFF, avoidTriglavian: true })).toEqual([TRIG_A]);
  });

  it('adds systems at or over the pod-kill threshold', () => {
    const podKillsBySystem = new Map([
      [PODDED, 3],
      [TAMA, 2],
    ]);
    expect(effectiveAvoid({ ...OFF, avoidPodKills: true, podKillsBySystem })).toEqual([PODDED]);
  });

  /*
   * An unread kill feed is not a quiet universe. It adds nothing — and the
   * caller says the feed is missing — rather than being read as zero kills
   * everywhere, which would look identical but claim something false.
   */
  it('adds nothing for pod kills when the feed could not be read', () => {
    expect(effectiveAvoid({ ...OFF, avoidPodKills: true, podKillsBySystem: null })).toEqual([]);
  });

  it('is sorted and deduped, so the same rules always give the same list', () => {
    expect(
      effectiveAvoid({
        ...OFF,
        avoidList: [PODDED, EDENCOM_A],
        avoidEdencom: true,
        avoidPodKills: true,
      })
    ).toEqual([EDENCOM_A, PODDED]);
  });
});

describe('avoidListKey', () => {
  it('is empty for nothing avoided', () => {
    expect(avoidListKey([])).toBe('');
  });

  it('is short however long the list, and differs for different lists', () => {
    const long = Array.from({ length: 165 }, (_, i) => 30000001 + i);
    expect(avoidListKey(long).length).toBeLessThan(16);
    expect(avoidListKey([1, 2])).not.toBe(avoidListKey([1, 3]));
    expect(avoidListKey([1, 2])).toBe(avoidListKey([1, 2]));
  });
});

describe('candidateAvoid', () => {
  it('adds the system to the avoid list the route already uses, sorted', () => {
    expect(
      candidateAvoid({
        effective: [30, 10],
        systemId: 20,
        avoidList: [10],
        avoidListEnabled: true,
      })
    ).toEqual([10, 20, 30]);
  });

  it('does not list a system twice', () => {
    expect(
      candidateAvoid({ effective: [10, 20], systemId: 20, avoidList: [20], avoidListEnabled: true })
    ).toEqual([10, 20]);
  });

  it('brings in the whole stored list when the switch is off, since turning it on does', () => {
    expect(
      candidateAvoid({
        effective: [5],
        systemId: 20,
        avoidList: [40, 10],
        avoidListEnabled: false,
      })
    ).toEqual([5, 10, 20, 40]);
  });
});
