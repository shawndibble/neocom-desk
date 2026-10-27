import { describe, it, expect } from 'vitest';
import type { EngineSkill } from '@/engine/types';
import type { Certificate } from '@/sde/types';
import {
  certificateRows,
  certificateTimes,
  ALL_GRADES,
  filterRows,
  gradeCounts,
  sortRows,
  type CertificateRow,
} from './certificatesModel';

function cert(id: number, name: string, groupName: string, base: number): Certificate {
  return {
    id,
    name,
    description: '',
    groupId: 1,
    groupName,
    levels: [1, 2, 3, 4, 5].map((level) => [{ skillTypeID: base, level }]),
  };
}

const NAV = cert(1, 'Navigation', 'Navigation', 100);
const ARMOR = cert(2, 'Armor Tanking', 'Armor', 200);
const DRONES = cert(3, 'Light Drones', 'Drones', 300);

const trained = (levels: Record<number, number>) => (id: number) => levels[id] ?? 0;

describe('certificateRows', () => {
  it('grades each certificate and lists what the next grade still needs', () => {
    const [nav] = certificateRows([NAV], { trainedLevel: trained({ 100: 2 }), planEntries: [] });
    expect(nav.grade).toBe(2);
    expect(nav.next).toEqual([{ skillTypeID: 100, targetLevel: 3 }]);
    expect(nav.unplanned).toEqual([{ skillTypeID: 100, targetLevel: 3 }]);
  });

  it('drops what the plan already covers from what Add would add', () => {
    const [nav] = certificateRows([NAV], {
      trainedLevel: trained({ 100: 2 }),
      planEntries: [{ skillTypeID: 100, targetLevel: 3 }],
    });
    expect(nav.next).toHaveLength(1);
    expect(nav.unplanned).toEqual([]);
  });

  it('has no next grade once Elite', () => {
    const [nav] = certificateRows([NAV], { trainedLevel: trained({ 100: 5 }), planEntries: [] });
    expect(nav.grade).toBe(5);
    expect(nav.next).toEqual([]);
  });

  it('marks the levels an Alpha clone cannot train, only when Alpha caps are given', () => {
    const alphaMaxLevel = (id: number) => (id === 100 ? 2 : 0);
    const [omega] = certificateRows([NAV], { trainedLevel: trained({ 100: 2 }), planEntries: [] });
    expect(omega.alphaCapped).toEqual([]);
    const [alpha] = certificateRows([NAV], {
      trainedLevel: trained({ 100: 2 }),
      planEntries: [],
      alphaMaxLevel,
    });
    expect(alpha.alphaCapped).toEqual([{ skillTypeID: 100, targetLevel: 3 }]);
  });
});

function rows(levels: Record<number, number>): CertificateRow[] {
  return certificateRows([NAV, ARMOR, DRONES], { trainedLevel: trained(levels), planEntries: [] });
}

describe('gradeCounts', () => {
  it('counts certificates at each of the six grades', () => {
    expect(gradeCounts(rows({ 100: 5, 200: 4 }))).toEqual([1, 0, 0, 0, 1, 1]);
    expect(gradeCounts(rows({ 100: 1 }))).toEqual([2, 1, 0, 0, 0, 0]);
  });
});

describe('filterRows', () => {
  const all = rows({ 100: 5, 200: 1 });
  const ids = (filtered: CertificateRow[]) => filtered.map((r) => r.certificate.id);

  it('limits to one group', () => {
    expect(ids(filterRows(all, { group: 'Armor', grades: ALL_GRADES }))).toEqual([2]);
  });

  it('keeps only the chosen grades', () => {
    expect(ids(filterRows(all, { group: null, grades: new Set([0, 1] as const) }))).toEqual([2, 3]);
    expect(ids(filterRows(all, { group: null, grades: new Set([5] as const) }))).toEqual([1]);
    expect(filterRows(all, { group: null, grades: new Set() })).toEqual([]);
  });
});

describe('sortRows', () => {
  const all = rows({ 100: 3, 200: 1 });

  it('defaults to lowest grade first, then name', () => {
    expect(sortRows(all, 'grade', new Map()).map((r) => r.certificate.id)).toEqual([3, 2, 1]);
  });

  it('sorts by name', () => {
    expect(sortRows(all, 'name', new Map()).map((r) => r.certificate.id)).toEqual([2, 3, 1]);
  });

  it('sorts by least time to the next grade, Elite last', () => {
    const elite = rows({ 100: 5, 200: 1 });
    const seconds = new Map([
      [2, { total: 600, steps: [] }],
      [3, { total: 60, steps: [] }],
    ]);
    expect(sortRows(elite, 'time', seconds).map((r) => r.certificate.id)).toEqual([3, 2, 1]);
  });
});

describe('certificateTimes', () => {
  const skill = (typeID: number, prereqs: { typeID: number; level: number }[] = []) =>
    ({
      typeID,
      name: `S${typeID}`,
      rank: 1,
      primary: 'intelligence',
      secondary: 'memory',
      prereqs,
    }) as EngineSkill;
  const ctx = {
    // 200 needs 100 at II — a prerequisite the certificate itself never names.
    skills: new Map([
      [100, skill(100)],
      [200, skill(200, [{ typeID: 100, level: 2 }])],
    ]),
    trainedSkills: new Map(),
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    implants: {},
    cloneState: 'omega' as const,
  };
  const CERT = cert(9, 'Needs a prereq', 'Armor', 200);

  it('lists every scheduled step, injected prerequisites included, so the steps sum to the total', () => {
    const [row] = certificateRows([CERT], { trainedLevel: () => 0, planEntries: [] });
    const times = certificateTimes([row], ctx).get(9);
    expect(times).toBeDefined();
    expect(times!.steps.map((s) => [s.skillTypeID, s.level])).toEqual([
      [100, 2],
      [200, 1],
    ]);
    expect(times!.steps.reduce((sum, s) => sum + s.seconds, 0)).toBe(times!.total);
    expect(times!.total).toBeGreaterThan(0);
  });

  it('has no entry for an Elite certificate', () => {
    const [row] = certificateRows([CERT], { trainedLevel: () => 5, planEntries: [] });
    expect(certificateTimes([row], ctx).has(9)).toBe(false);
  });
});
