import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseDeleteDoctrine, parseSaveDoctrine } from './srpDoctrineInput.js';

const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return (err as HttpsError).message;
  }
  throw new Error('expected a failure');
};
const ok = { name: ' Fleet Rifter ', snapshot: { hullTypeId: 587, modules: [3, 1, 2], rigs: [9] } };

describe('parseSaveDoctrine', () => {
  it('trims the name, sorts the lists, copies the name into the snapshot', () => {
    expect(parseSaveDoctrine(ok)).toEqual({
      name: 'Fleet Rifter',
      snapshot: { hullTypeId: 587, name: 'Fleet Rifter', modules: [1, 2, 3], rigs: [9] },
    });
  });
  it('keeps an id for a replace and drops stray fields', () => {
    expect(parseSaveDoctrine({ ...ok, id: 'abc_1', createdBy: 5 }).id).toBe('abc_1');
    expect(parseSaveDoctrine({ ...ok, id: 'abc_1' })).not.toHaveProperty('createdBy');
  });
  it('validates name, hull, id and the lists', () => {
    expect(fails(() => parseSaveDoctrine({ ...ok, name: '' }))).toMatch(/name/);
    expect(fails(() => parseSaveDoctrine({ ...ok, name: 'x'.repeat(81) }))).toMatch(/name/);
    expect(fails(() => parseSaveDoctrine({ ...ok, id: 'a/b' }))).toMatch(/id/);
    expect(fails(() => parseSaveDoctrine({ ...ok, snapshot: undefined }))).toMatch(/object/);
    for (const hullTypeId of [0, 1.5, '587', 2_147_483_648]) {
      expect(
        fails(() => parseSaveDoctrine({ ...ok, snapshot: { ...ok.snapshot, hullTypeId } }))
      ).toMatch(/hullTypeId/);
    }
    expect(
      fails(() => parseSaveDoctrine({ ...ok, snapshot: { ...ok.snapshot, modules: [0] } }))
    ).toMatch(/modules/);
    expect(
      fails(() => parseSaveDoctrine({ ...ok, snapshot: { ...ok.snapshot, rigs: 'x' } }))
    ).toMatch(/rigs/);
  });
  it('caps module and rig counts', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect(
      parseSaveDoctrine({ ...ok, snapshot: { ...ok.snapshot, modules: many(40) } })
    ).toBeTruthy();
    expect(
      fails(() => parseSaveDoctrine({ ...ok, snapshot: { ...ok.snapshot, modules: many(41) } }))
    ).toMatch(/at most 40/);
    expect(
      fails(() => parseSaveDoctrine({ ...ok, snapshot: { ...ok.snapshot, rigs: many(9) } }))
    ).toMatch(/at most 8/);
  });
});

describe('parseDeleteDoctrine', () => {
  it('needs a safe id', () => {
    expect(parseDeleteDoctrine({ id: 'abc' })).toEqual({ id: 'abc' });
    expect(fails(() => parseDeleteDoctrine({}))).toMatch(/id/);
    expect(fails(() => parseDeleteDoctrine({ id: '../x' }))).toMatch(/id/);
  });
});
