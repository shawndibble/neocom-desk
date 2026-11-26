import { describe, expect, it } from 'vitest';
import { DEFAULT_POP_SHARING } from '../../../../functions/src/popSharing';
import { defaultsPatch, draftOf, moonPatch, settingsOfDraft } from './popSharingForm';

describe('popSharingForm', () => {
  it('a draft round-trips; an empty rate is the book rate', () => {
    const draft = draftOf({ ...DEFAULT_POP_SHARING, ratePct: 6.5 });
    expect(draft.rate).toBe('6.5');
    expect(settingsOfDraft({ ...draft, rate: '' })).toEqual(DEFAULT_POP_SHARING);
    expect(settingsOfDraft(draft)).toEqual({ ...DEFAULT_POP_SHARING, ratePct: 6.5 });
  });

  it('refuses a rate outside 0-100', () => {
    expect(settingsOfDraft({ ...draftOf(DEFAULT_POP_SHARING), rate: '120' })).toBeNull();
    expect(settingsOfDraft({ ...draftOf(DEFAULT_POP_SHARING), rate: 'x' })).toBeNull();
  });

  it('a default patch carries only what changed', () => {
    const next = { ...DEFAULT_POP_SHARING, notes: 'Fleet', showOre: false };
    expect(defaultsPatch(DEFAULT_POP_SHARING, next)).toEqual({ notes: 'Fleet', showOre: false });
    expect(defaultsPatch(DEFAULT_POP_SHARING, DEFAULT_POP_SHARING)).toEqual({});
  });

  it('a moon patch sets what the moon now overrides and clears what follows the default again', () => {
    const settings = { ...DEFAULT_POP_SHARING, popTime: 'auto-fracture' as const, notes: 'x' };
    expect(
      moonPatch({ notes: 'x', showOre: false }, settings, new Set(['popTime', 'notes']))
    ).toEqual({ set: { popTime: 'auto-fracture' }, clear: ['showOre'] });
    expect(moonPatch({ notes: 'x' }, settings, new Set(['notes']))).toEqual({ set: {}, clear: [] });
  });

  it('a moon set to the book rate overrides a default that names a rate', () => {
    expect(moonPatch({}, { ...DEFAULT_POP_SHARING, ratePct: null }, new Set(['ratePct']))).toEqual({
      set: { ratePct: null },
      clear: [],
    });
  });
});
