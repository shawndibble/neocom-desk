import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setSurveyInfo, setSurveyTax } = vi.hoisted(() => ({
  setSurveyInfo: vi.fn(),
  setSurveyTax: vi.fn(),
}));
vi.mock('./surveyStore', () => ({ setSurveyInfo, setSurveyTax }));

import { writeTemplateToSurvey } from './surveyTemplateWrite';

const SURVEY = { id: 'abc123XYZ', expiresAt: 9000 };

beforeEach(() => {
  setSurveyInfo.mockReset().mockResolvedValue(undefined);
  setSurveyTax.mockReset().mockResolvedValue(undefined);
});

describe('writeTemplateToSurvey', () => {
  it('stores the location and notes, and the tax, of a full template', async () => {
    await writeTemplateToSurvey(SURVEY, {
      id: 't',
      name: 'Efa',
      location: { id: 1, name: 'Efa IX' },
      tax: { name: 'Snowfall', pct: 8 },
      notes: 'Dock',
    });
    expect(setSurveyInfo).toHaveBeenCalledWith({
      ...SURVEY,
      location: { id: 1, name: 'Efa IX' },
      notes: 'Dock',
    });
    expect(setSurveyTax).toHaveBeenCalledWith({ ...SURVEY, name: 'Snowfall', pct: 8 });
  });

  it('writes only what the template holds', async () => {
    await writeTemplateToSurvey(SURVEY, { id: 't', name: 'Notes only', notes: 'Hi' });
    expect(setSurveyInfo).toHaveBeenCalledWith({ ...SURVEY, location: null, notes: 'Hi' });
    expect(setSurveyTax).not.toHaveBeenCalled();

    setSurveyInfo.mockClear();
    await writeTemplateToSurvey(SURVEY, {
      id: 't',
      name: 'Tax only',
      tax: { name: 'Snowfall', pct: 5 },
    });
    expect(setSurveyInfo).not.toHaveBeenCalled();
    expect(setSurveyTax).toHaveBeenCalledTimes(1);
  });
});
