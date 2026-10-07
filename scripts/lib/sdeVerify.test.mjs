import { describe, expect, it } from 'vitest';
import { compareType, driftIssueAction, renderDiff } from './sdeVerify.mjs';

const esiType = {
  type_id: 3178,
  name: 'Light Neutron Blaster II',
  group_id: 74,
  volume: 5,
  dogma_attributes: [
    { attribute_id: 160, value: 0.0105 },
    { attribute_id: 620, value: 40000 },
  ],
};
const names = { 160: 'trackingSpeed', 620: 'optimalSigRadius' };

describe('compareType', () => {
  it('returns nothing when everything matches', () => {
    const baked = {
      typeID: 3178,
      fields: { name: 'Light Neutron Blaster II', groupID: 74, volume: 5 },
      attributes: [
        { id: 160, name: 'trackingSpeed', value: 0.0105, pinned: true },
        { id: 620, name: 'optimalSigRadius', pinned: true },
      ],
    };
    expect(compareType(esiType, baked, names)).toEqual([]);
  });

  it('flags a value mismatch', () => {
    const baked = {
      typeID: 3178,
      fields: { volume: 10 },
      attributes: [{ id: 620, name: 'optimalSigRadius', value: 20000, pinned: true }],
    };
    expect(compareType(esiType, baked, names)).toEqual([
      {
        typeID: 3178,
        kind: 'value-mismatch',
        what: 'volume',
        expected: 10,
        actual: 5,
        pinned: false,
      },
      {
        typeID: 3178,
        kind: 'value-mismatch',
        what: 'attribute 620 (optimalSigRadius)',
        expected: 20000,
        actual: 40000,
        pinned: true,
      },
    ]);
  });

  it('flags a missing attribute', () => {
    const baked = {
      typeID: 3178,
      attributes: [{ id: 275, name: 'skillTimeConstant', pinned: true }],
    };
    expect(compareType(esiType, baked, names)).toEqual([
      {
        typeID: 3178,
        kind: 'missing-attribute',
        what: 'attribute 275 (skillTimeConstant)',
        expected: 'present',
        actual: 'absent',
        pinned: true,
      },
    ]);
  });

  it('flags a wrong attribute name', () => {
    const baked = { typeID: 3178, attributes: [{ id: 160, name: 'maxRange', pinned: true }] };
    expect(compareType(esiType, baked, names)).toEqual([
      {
        typeID: 3178,
        kind: 'wrong-attribute-name',
        what: 'attribute 160',
        expected: 'maxRange',
        actual: 'trackingSpeed',
        pinned: true,
      },
    ]);
  });

  it('treats floats within tolerance as equal', () => {
    const baked = { typeID: 3178, attributes: [{ id: 160, value: 0.01050000001 }] };
    expect(compareType(esiType, baked, names)).toEqual([]);
  });
});

describe('driftIssueAction', () => {
  const pinned = {
    typeID: 1,
    kind: 'value-mismatch',
    what: 'attribute 275',
    expected: 5,
    actual: 3,
    pinned: true,
  };
  const loose = { ...pinned, pinned: false };

  it('creates an issue on pinned drift with none open', () => {
    const a = driftIssueAction([pinned], null);
    expect(a.action).toBe('create');
    expect(a.body).toContain('attribute 275');
  });

  it('comments on the open issue instead of duplicating', () => {
    expect(driftIssueAction([pinned], { number: 9 })).toMatchObject({
      action: 'comment',
      number: 9,
    });
  });

  it('closes the open issue when the run is clean', () => {
    expect(driftIssueAction([loose], { number: 9 })).toMatchObject({ action: 'close', number: 9 });
  });

  it('does nothing when clean and nothing is open', () => {
    expect(driftIssueAction([], null)).toEqual({ action: 'none' });
  });
});

describe('renderDiff', () => {
  it('marks pinned rows and says so when clean', () => {
    expect(renderDiff([])).toBe('No differences.');
    const out = renderDiff([
      {
        typeID: 1,
        kind: 'missing-attribute',
        what: 'attribute 2',
        expected: 'present',
        actual: 'absent',
        pinned: true,
      },
    ]);
    expect(out).toContain('[pinned]');
    expect(out).toContain('type 1');
  });
});
