import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

// Industry's short labels and titles capitalise the glossary terms Build Plan / Build Group,
// matching "Create Build Plan" and Stock Targets' "New Build Group". Prose stays as is.
const INDUSTRY_LABEL_KEYS = [
  'addPlan',
  'deletePlan',
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
