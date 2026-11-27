import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPopFill } from './applyPopFill';

const { setSurveyInfo, setSurveyTax } = vi.hoisted(() => ({
  setSurveyInfo: vi.fn(),
  setSurveyTax: vi.fn(),
}));
vi.mock('./surveyStore', () => ({ setSurveyInfo, setSurveyTax }));

const blank = { id: 'abc234', expiresAt: 5000, published: null, info: null };
const withNotes = { ...blank, info: { location: null, notes: 'dock at the east gate' } };
const details = {
  place: { id: 1_000_000_000_001, name: 'Alpha Refinery' },
  payee: { name: 'Mining Co', pct: 10 },
};

beforeEach(() => {
  setSurveyInfo.mockReset().mockResolvedValue(undefined);
  setSurveyTax.mockReset().mockResolvedValue(undefined);
});

describe('applyPopFill', () => {
  it('writes a blank location with the Survey notes kept, and a blank tax', async () => {
    await applyPopFill(withNotes, 7, details);
    expect(setSurveyInfo).toHaveBeenCalledWith({
      id: 'abc234',
      expiresAt: 5000,
      location: details.place,
      notes: 'dock at the east gate',
      characterId: 7,
    });
    expect(setSurveyTax).toHaveBeenCalledWith({
      id: 'abc234',
      expiresAt: 5000,
      name: 'Mining Co',
      pct: 10,
      characterId: 7,
    });
  });

  it('never overwrites a location or tax the pilot already set', async () => {
    const set = {
      ...blank,
      published: { name: 'Me', pct: 5 },
      info: { location: { id: null, name: 'my moon' }, notes: '' },
    };
    await applyPopFill(set, 7, details);
    expect(setSurveyInfo).not.toHaveBeenCalled();
    expect(setSurveyTax).not.toHaveBeenCalled();
  });

  it('writes nothing for a pop with no usable place or payee', async () => {
    await applyPopFill(blank, 7, { place: null, payee: null });
    expect(setSurveyInfo).not.toHaveBeenCalled();
    expect(setSurveyTax).not.toHaveBeenCalled();
  });

  it('still writes the tax when the location write fails, and does not throw', async () => {
    setSurveyInfo.mockRejectedValue(new Error('offline'));
    await expect(applyPopFill(blank, 7, details)).resolves.toBeUndefined();
    expect(setSurveyTax).toHaveBeenCalled();
  });
});
