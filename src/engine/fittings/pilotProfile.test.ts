import { describe, expect, it } from 'vitest';
import { buildAllVProfile, buildPilotProfile } from './pilotProfile';

describe('buildPilotProfile', () => {
  it('carries the given skill levels and implants through unchanged', () => {
    const skills = new Map([
      [3300, 5],
      [3301, 3],
    ]);
    const profile = buildPilotProfile(skills, [19540, 19553]);

    expect(profile.skillLevels.get(3300)).toBe(5);
    expect(profile.skillLevels.get(3301)).toBe(3);
    expect(profile.implantTypeIds).toEqual([19540, 19553]);
  });

  it('copies the skills map so a later mutation of the caller map does not reach the profile', () => {
    const skills = new Map([[3300, 4]]);
    const profile = buildPilotProfile(skills, []);

    skills.set(3300, 1);

    expect(profile.skillLevels.get(3300)).toBe(4);
  });

  it('defaults to no implants when none are given', () => {
    const profile = buildPilotProfile(new Map(), []);
    expect(profile.implantTypeIds).toEqual([]);
  });

  it('carries no boosters — ESI exposes no active-booster read', () => {
    const profile = buildPilotProfile(new Map(), [19540]);
    expect(profile.boosterTypeIds).toEqual([]);
  });
});

describe('buildAllVProfile', () => {
  it('sets every given skill type id to level 5', () => {
    const profile = buildAllVProfile([3300, 3301, 3302]);

    expect(profile.skillLevels.size).toBe(3);
    expect(profile.skillLevels.get(3300)).toBe(5);
    expect(profile.skillLevels.get(3301)).toBe(5);
    expect(profile.skillLevels.get(3302)).toBe(5);
  });

  it('carries no implants — the logged-out share view has no clone', () => {
    const profile = buildAllVProfile([3300]);
    expect(profile.implantTypeIds).toEqual([]);
  });

  it('carries no boosters', () => {
    const profile = buildAllVProfile([3300]);
    expect(profile.boosterTypeIds).toEqual([]);
  });
});
