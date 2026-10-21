import { describe, expect, it } from 'vitest';
import {
  MAX_REFINERY_LABEL,
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
