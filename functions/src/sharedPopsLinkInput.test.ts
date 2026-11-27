import { describe, expect, it } from 'vitest';
import { parseLinkSharedPopSurveyInput } from './sharedPopsStore.js';

const base = { popId: '98000001_1000_1', surveyId: 'abc234' };

describe('parseLinkSharedPopSurveyInput', () => {
  it('leaves onlyIfUnlinked off unless it is asked for', () => {
    expect(parseLinkSharedPopSurveyInput(base)).toEqual({ ...base, onlyIfUnlinked: false });
  });

  it('carries onlyIfUnlinked when it is true', () => {
    expect(parseLinkSharedPopSurveyInput({ ...base, onlyIfUnlinked: true })).toEqual({
      ...base,
      onlyIfUnlinked: true,
    });
  });

  it('rejects an onlyIfUnlinked that is not a boolean', () => {
    expect(() => parseLinkSharedPopSurveyInput({ ...base, onlyIfUnlinked: 'yes' })).toThrow(
      /onlyIfUnlinked/
    );
  });
});
