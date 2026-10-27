import { describe, expect, it } from 'vitest';
import { generateShareId } from '@/engine/share/shareId';
import { parseSurveyRef } from './surveyRef';

describe('parseSurveyRef', () => {
  const id = generateShareId();

  it('takes a bare Share Link id or a pasted /s/<id> link', () => {
    expect(parseSurveyRef(id)).toBe(id);
    expect(parseSurveyRef(`  https://neocom.example/neocom-desk/s/${id}?x=1 `)).toBe(id);
  });

  it('refuses anything else', () => {
    expect(parseSurveyRef('')).toBeNull();
    expect(parseSurveyRef('https://example.com/other/page')).toBeNull();
    expect(parseSurveyRef('../x')).toBeNull();
  });
});
