import { describe, expect, it } from 'vitest';
import { buildCourierContractR2Index, buildCourierObject } from './courierContractObjects.js';
import type { PublicCourierContractRow } from './publicContracts.js';

const row = (contractId: number): PublicCourierContractRow =>
  ({ contractId }) as unknown as PublicCourierContractRow;

describe('buildCourierObject', () => {
  it('names the object by the hash of its rows', () => {
    const object = buildCourierObject([row(1), row(2)]);
    expect(object.name).toBe(`courier-contracts/rows.${object.hash}.json`);
    expect(JSON.parse(object.body)).toHaveLength(2);
  });

  it('hashes the same rows to the same name whatever their order', () => {
    expect(buildCourierObject([row(1), row(2)]).name).toBe(
      buildCourierObject([row(2), row(1)]).name
    );
  });

  it('names a different object when a row changes', () => {
    expect(buildCourierObject([row(1)]).name).not.toBe(buildCourierObject([row(2)]).name);
  });

  it('builds an object for no rows', () => {
    expect(buildCourierObject([]).body).toBe('[]');
  });
});

describe('buildCourierContractR2Index', () => {
  it('carries the stamp, the row count and the object name', () => {
    const object = buildCourierObject([row(1)]);
    expect(buildCourierContractR2Index(object, 1, 500)).toEqual({
      lastSyncedAt: 500,
      count: 1,
      object: object.name,
    });
  });
});
