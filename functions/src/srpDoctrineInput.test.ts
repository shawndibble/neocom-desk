import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  MAX_DOCTRINE_SHARE_CODE,
  parseDeleteDoctrine,
  parseSaveDoctrine,
} from './srpDoctrineInput.js';

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

describe('parseSaveDoctrine shareCode', () => {
  it('keeps a Fitting Share Code; a save without one stays valid', () => {
    expect(parseSaveDoctrine({ ...ok, shareCode: 'AbC-_9' }).shareCode).toBe('AbC-_9');
    expect(parseSaveDoctrine(ok)).not.toHaveProperty('shareCode');
  });
  it('refuses a code that is not base64url or is too long', () => {
    expect(fails(() => parseSaveDoctrine({ ...ok, shareCode: 'a b' }))).toMatch(/shareCode/);
    expect(fails(() => parseSaveDoctrine({ ...ok, shareCode: '' }))).toMatch(/shareCode/);
    expect(fails(() => parseSaveDoctrine({ ...ok, shareCode: 5 }))).toMatch(/shareCode/);
    expect(
      fails(() => parseSaveDoctrine({ ...ok, shareCode: 'a'.repeat(MAX_DOCTRINE_SHARE_CODE + 1) }))
    ).toMatch(/shareCode/);
    expect(
      parseSaveDoctrine({ ...ok, shareCode: 'a'.repeat(MAX_DOCTRINE_SHARE_CODE) }).shareCode
    ).toHaveLength(MAX_DOCTRINE_SHARE_CODE);
  });
});

describe('parseDeleteDoctrine', () => {
  it('needs a safe id', () => {
    expect(parseDeleteDoctrine({ id: 'abc' })).toEqual({ id: 'abc' });
    expect(fails(() => parseDeleteDoctrine({}))).toMatch(/id/);
    expect(fails(() => parseDeleteDoctrine({ id: '../x' }))).toMatch(/id/);
  });
});
