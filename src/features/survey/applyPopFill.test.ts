import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPopFill } from './applyPopFill';

const { setSurveyInfo, setSurveyTax } = vi.hoisted(() => ({
  setSurveyInfo: vi.fn(),
  setSurveyTax: vi.fn(),
}));
vi.mock('./surveyStore', () => ({ setSurveyInfo, setSurveyTax }));

const survey = {
  id: 'abc234',
  expiresAt: 5000,
  published: null,
  info: { location: null, notes: 'dock at the east gate' },
};
const place = { id: 1_000_000_000_001, name: 'Alpha Refinery' };

beforeEach(() => {
  setSurveyInfo.mockReset().mockResolvedValue(undefined);
  setSurveyTax.mockReset().mockResolvedValue(undefined);
});

describe('applyPopFill', () => {
  it('writes the location with the Survey notes kept, and the tax', async () => {
    await applyPopFill(survey, 7, { location: place, tax: { name: 'Mining Co', pct: 10 } });
    expect(setSurveyInfo).toHaveBeenCalledWith({
      id: 'abc234',
      expiresAt: 5000,
      location: place,
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

  it('writes nothing for an empty fill', async () => {
    await applyPopFill(survey, 7, {});
    expect(setSurveyInfo).not.toHaveBeenCalled();
    expect(setSurveyTax).not.toHaveBeenCalled();
  });
});
