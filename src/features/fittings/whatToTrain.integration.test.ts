import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import { buildPilotProfile } from '@/engine/fittings/pilotProfile';
import {
  evaluateSkillGains,
  rankSkillGains,
  skillGainCandidates,
  type SkillGain,
} from '@/engine/fittings/skillGains';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import {
  computeFittingStats,
  fittingSkillSources,
  moduleSkillRequirements,
} from './dogmaFittingEngine';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  evaluateModuleUpgrades,
  moduleUpgradeCandidates,
  raisedSkillLevels,
  type ModuleUpgradeGain,
} from '@/engine/fittings/moduleUpgrades';
import { levelGain, type LevelGain } from '@/engine/fittings/skillGains';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import {
  buildVariationIndex,
  type MetaGroupNameMap,
  type VariationTypeMap,
} from '@/engine/market/variations';

const require = createRequire(import.meta.url);

/**
 * "What to train" end to end on a player's railgun Rokh, through the real
 * `computeFittingStats` (fetch and Cache Storage stubbed to serve the pinned
 * engine and SDE from node_modules), pinning the Overall order that scope
 * decision `20261002-234731-what-to-train-weighted-overall-weapon-reach-ranked`
 * set. The order rests on the pinned `@eveshipfit/dogma-engine` +
 * `@eveshipfit/sde` (ADR 0016): if a bump moves it, re-check the order
 * against that decision rather than just re-pinning. Skill type ids were
 * looked up by exact name in `public/data/skills.json`, 2026-10-02.
 */

/** The fit, as shared from the live site. */
const ROKH_SHARE =
  '2.RcvLCoMwEIXhF5pFZnJRjrs-SisGo6kSwUvJwxdTaFbzDYc_8JYVhgsCnw7iSqnUlabSVrrK5s9OgdMJIYaZBwgJ9u2CkAanD4QM2j5CyILHu4n9TA66T5BO4VpK2uxS0t_V4BDKPL3ulDGprezl77JfDSws8THCQpFf5b45xz6AyY0Q15JPB_j5JjdB9hc1Gkx8neCcH8sSvw';

const LARGE_HYBRID_TURRET = 3307;
const RAPID_FIRING = 3310;
const SHARPSHOOTER = 3311;
const MOTION_PREDICTION = 3312;
const SURGICAL_STRIKE = 3315;
const CONTROLLED_BURSTS = 3316;
const TRAJECTORY_ANALYSIS = 3317;
const DRONE_INTERFACING = 3442;
const MINMATAR_DRONE_SPECIALIZATION = 12485;

/** The levels that player's "What to train" list showed; everything else at V. */
const PLAYER_LEVELS: [number, number][] = [
  [CONTROLLED_BURSTS, 4],
  [LARGE_HYBRID_TURRET, 3],
  [SURGICAL_STRIKE, 4],
  [DRONE_INTERFACING, 4],
  [MINMATAR_DRONE_SPECIALIZATION, 4],
  [RAPID_FIRING, 4],
  [SHARPSHOOTER, 4],
  [MOTION_PREDICTION, 4],
  [TRAJECTORY_ANALYSIS, 4],
];

/** Serves the pinned engine and SDE from node_modules to `loadDogmaEngine`'s fetch. */
async function stubEngineAssets() {
  const wasmPath = require.resolve('@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm');
  const sdePath = require.resolve('@eveshipfit/sde/dist/sde.dat');
  const [wasm, sde] = await Promise.all([readFile(wasmPath), readFile(sdePath)]);
  const respond = (bytes: Buffer, type: string) =>
    new Response(new Uint8Array(bytes), {
      headers: { 'content-type': type, 'content-length': String(bytes.byteLength) },
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('.wasm')) return respond(wasm, 'application/wasm');
      if (url.includes('sde.dat')) return respond(sde, 'application/octet-stream');
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
  const cache = { match: async () => undefined, put: async () => {} };
  vi.stubGlobal('caches', {
    open: async () => cache,
    keys: async () => [],
    delete: async () => false,
  });
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(require.resolve(`../../../public/data/${path}`), 'utf8')) as T;
}

async function allSkillTypeIds(): Promise<number[]> {
  const raw = await readFile(require.resolve('../../../public/data/skills.json'), 'utf8');
  return (JSON.parse(raw) as { typeID: number }[]).map((skill) => skill.typeID);
}

describe('What to train on a railgun Rokh (real WASM + real pinned SDE)', () => {
  let fitting: Fitting;
  let pilot: PilotProfile;
  let gains: SkillGain[];

  beforeAll(async () => {
    await stubEngineAssets();
    const decoded = await decodeFittingShare(ROKH_SHARE);
    if (!decoded.ok) throw new Error('share code did not decode');
    fitting = shareToFitting(decoded.value, 'Boom');
    const ids = await allSkillTypeIds();
    const levels = new Map(ids.map((id): [number, number] => [id, 5]));
    for (const [id, level] of PLAYER_LEVELS) levels.set(id, level);
    pilot = buildPilotProfile(levels, []);

    const allV = buildPilotProfile(new Map(ids.map((id): [number, number] => [id, 5])), []);
    const sources = await fittingSkillSources(fitting, allV);
    const candidates = skillGainCandidates(sources, pilot.skillLevels);
    const before = await computeFittingStats(fitting, pilot, undefined, undefined, {
      overheated: false,
    });
    const evaluated = await evaluateSkillGains(candidates, async (skillTypeId, level) => {
      const skillLevels = new Map(pilot.skillLevels);
      skillLevels.set(skillTypeId, level);
      const after = await computeFittingStats(
        fitting,
        { ...pilot, skillLevels },
        undefined,
        undefined,
        { overheated: false }
      );
      return { before, after };
    });
    if (evaluated === null) throw new Error('evaluation was cancelled');
    gains = evaluated;
  }, 60_000);

  afterAll(() => vi.unstubAllGlobals());

  const overallOrder = () => rankSkillGains(gains, 'overall').map((gain) => gain.skillTypeId);

  const rank = (skillTypeId: number) => overallOrder().indexOf(skillTypeId);

  it('ranks Rapid Firing above a +2 DPS drone skill, though it runs the cap dry sooner', () => {
    expect(rank(RAPID_FIRING)).toBeGreaterThanOrEqual(0);
    expect(rank(RAPID_FIRING)).toBeLessThan(rank(MINMATAR_DRONE_SPECIALIZATION));
  });

  it('ranks the gun damage skills above a few more seconds of capacitor', () => {
    expect(rank(RAPID_FIRING)).toBeLessThan(rank(CONTROLLED_BURSTS));
    expect(rank(LARGE_HYBRID_TURRET)).toBeLessThan(rank(CONTROLLED_BURSTS));
    expect(rank(SURGICAL_STRIKE)).toBeLessThan(rank(CONTROLLED_BURSTS));
  });

  it('suggests the range and tracking skills, each with its change', () => {
    const byId = new Map(gains.map((gain) => [gain.skillTypeId, gain]));
    expect(byId.get(SHARPSHOOTER)?.roleChanges.map((c) => c.key)).toEqual(['optimal']);
    expect(byId.get(TRAJECTORY_ANALYSIS)?.roleChanges.map((c) => c.key)).toEqual(['falloff']);
    expect(byId.get(MOTION_PREDICTION)?.roleChanges.map((c) => c.key)).toEqual(['tracking']);
  });

  it('leaves each single-stat ranking unweighted', () => {
    expect(rankSkillGains(gains, 'dps')[0]?.skillTypeId).toBe(RAPID_FIRING);
  });
});

describe('Tech II upgrades on that Rokh (real WASM + real pinned SDE)', () => {
  const RAILGUN_425_I = 574;
  const RAILGUN_425_II = 3090;
  const LARGE_RAILGUN_SPECIALIZATION = 12207;
  const REPUBLIC_FLEET_LARGE_CAP_BATTERY = 41218;
  let rows: ModuleUpgradeGain<LevelGain>[];

  beforeAll(async () => {
    await stubEngineAssets();
    const decoded = await decodeFittingShare(ROKH_SHARE);
    if (!decoded.ok) throw new Error('share code did not decode');
    const fitting = shareToFitting(decoded.value, 'Boom');
    const levels = new Map((await allSkillTypeIds()).map((id): [number, number] => [id, 5]));
    for (const [id, level] of PLAYER_LEVELS) levels.set(id, level);
    // The player flies Tech I rails: no Large Railgun Specialization yet.
    levels.set(LARGE_RAILGUN_SPECIALIZATION, 0);
    const pilot = buildPilotProfile(levels, []);

    const [variations, rackOf] = await Promise.all([
      readJson<{ types: VariationTypeMap; metaGroups: MetaGroupNameMap }>('market/variations.json'),
      readJson<Record<string, string>>('fittingSlots.json'),
    ]);
    const index = buildVariationIndex(variations.types, variations.metaGroups);
    const statsOf = (fit: Fitting, profile: PilotProfile) =>
      computeFittingStats(fit, profile, undefined, undefined, { overheated: false });
    const before = await statsOf(fitting, pilot);
    const evaluated = await evaluateModuleUpgrades(
      moduleUpgradeCandidates(fitting.modules, index, rackOf),
      {
        fitting,
        levels: pilot.skillLevels,
        requirements: (typeId, rack) =>
          moduleSkillRequirements(fitting.shipTypeId, rack as CandidateRack, typeId),
        // The engine's requirements already reach down the prerequisite
        // chain; a real schedule only adds training times.
        schedule: (entries) =>
          entries.map((e) => ({ skillTypeID: e.skillTypeID, level: e.targetLevel, seconds: 1 })),
        compare: async (variant, trained) => ({
          before,
          after: await statsOf(variant, {
            ...pilot,
            skillLevels: raisedSkillLevels(pilot.skillLevels, trained),
          }),
        }),
        gain: levelGain,
        fits: fitsResourceBudget,
      }
    );
    if (evaluated === null) throw new Error('evaluation was cancelled');
    rows = evaluated;
  }, 60_000);

  afterAll(() => vi.unstubAllGlobals());

  it('suggests all eight 425mm Railgun I as IIs, behind Large Railgun Specialization', () => {
    const rails = rows.find((row) => row.fromTypeId === RAILGUN_425_I);
    expect(rails?.toTypeId).toBe(RAILGUN_425_II);
    expect(rails?.at).toHaveLength(8);
    expect(rails?.required).toContainEqual({
      skillTypeID: LARGE_RAILGUN_SPECIALIZATION,
      targetLevel: 1,
    });
    expect(rails?.required).toContainEqual({ skillTypeID: LARGE_HYBRID_TURRET, targetLevel: 5 });
    expect(rails?.metrics.dps).toBeGreaterThan(0);
  });

  it('never suggests a faction module, nor a module already Tech II', () => {
    const from = rows.map((row) => row.fromTypeId);
    expect(from).not.toContain(REPUBLIC_FLEET_LARGE_CAP_BATTERY);
    for (const row of rows) expect(row.fromTypeId).not.toBe(row.toTypeId);
  });
});
