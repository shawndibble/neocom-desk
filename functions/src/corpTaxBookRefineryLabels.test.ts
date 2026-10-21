import { describe, expect, it } from 'vitest';
import {
  MAX_LEARNED_SYSTEMS,
  MAX_REFINERY_LABEL,
  parseLearnRefinerySystemsInput,
  parseSetOwnRefineryLabelInput,
  parseSetRefineryLabelInput,
} from './corpTaxBookRefineryLabels.js';

describe('parseSetRefineryLabelInput', () => {
  const base = { corporationId: 9, accessToken: 't', feederCorporationId: 5, structureId: 4001 };
  it('reads the refinery and a trimmed label', () => {
    expect(parseSetRefineryLabelInput({ ...base, label: '  Efa Tatara ' })).toMatchObject({
      feederCorporationId: 5,
      structureId: 4001,
      label: 'Efa Tatara',
    });
  });
  it('reads a blank or null label as a clear', () => {
    expect(parseSetRefineryLabelInput({ ...base, label: '   ' }).label).toBeNull();
    expect(parseSetRefineryLabelInput({ ...base, label: null }).label).toBeNull();
  });
  it('rejects a bad structure id, a non-text label and an over-long one', () => {
    expect(() => parseSetRefineryLabelInput({ ...base, structureId: '1', label: 'x' })).toThrow();
    expect(() => parseSetRefineryLabelInput({ ...base, label: 5 })).toThrow();
    expect(() =>
      parseSetRefineryLabelInput({ ...base, label: 'x'.repeat(MAX_REFINERY_LABEL + 1) })
    ).toThrow();
  });
  it('needs the moon owner', () => {
    expect(() =>
      parseSetRefineryLabelInput({ corporationId: 9, structureId: 4001, label: 'x' })
    ).toThrow();
  });
});

describe('parseSetOwnRefineryLabelInput', () => {
  it("reads the moon owner's own call", () => {
    expect(
      parseSetOwnRefineryLabelInput({
        corporationId: 5,
        accessToken: 't',
        structureId: 4001,
        label: 'Ours',
      })
    ).toMatchObject({ corporationId: 5, structureId: 4001, label: 'Ours' });
  });
});

describe('parseLearnRefinerySystemsInput (#4650)', () => {
  it('reads the book and each system by structure id', () => {
    expect(
      parseLearnRefinerySystemsInput({ corporationId: 9, systems: { '4001': 30002187 } })
    ).toEqual({ corporationId: 9, systems: { '4001': 30002187 } });
  });
  it('rejects a bad id, a non-system, none or too many', () => {
    const call = (systems: unknown) => () =>
      parseLearnRefinerySystemsInput({ corporationId: 9, systems });
    expect(call({ abc: 30002187 })).toThrow();
    expect(call({ '4001': 60003760 })).toThrow();
    expect(call({})).toThrow();
    expect(
      call(
        Object.fromEntries(
          Array.from({ length: MAX_LEARNED_SYSTEMS + 1 }, (_, i) => [String(i + 1), 30002187])
        )
      )
    ).toThrow();
    expect(() => parseLearnRefinerySystemsInput({ systems: { '4001': 30002187 } })).toThrow();
  });
});
