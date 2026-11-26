import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

const INDUSTRY_LABEL_KEYS = [
  'addPlan',
  'compareTitle',
  'backToList',
  'createGroup',
  'jobsLogProductionNoPlanTitle',
  'compareTableLabel',
] as const;

describe('en.json glossary term casing', () => {
  it.each(INDUSTRY_LABEL_KEYS)('industry.%s capitalises Build Plan / Build Group', (key) => {
    const value = en.industry[key];
    expect(value).toMatch(/Build (Plan|Group)/);
    expect(value).not.toMatch(/build (plan|group)/);
  });
});
