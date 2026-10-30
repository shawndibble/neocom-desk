import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  forgetSurvey,
  noteSurvey,
  renameSurvey,
  SYNCED_SURVEY_HISTORY_KEY,
  useSurveyHistory,
} from './surveyHistory';

beforeEach(async () => {
  await db.settings.clear();
  useSurveyHistory.setState({ value: [], hydrated: false });
});

describe('survey history', () => {
  it('records a survey once and keeps it across a reload', async () => {
    await noteSurvey('abc123XYZ');
    await noteSurvey('abc123XYZ');
    expect(useSurveyHistory.getState().value.map((e) => e.id)).toEqual(['abc123XYZ']);

    const row = await db.settings.get(SYNCED_SURVEY_HISTORY_KEY);
    expect(row).toBeDefined();
    useSurveyHistory.setState({ value: [], hydrated: false });
    await useSurveyHistory.getState().hydrate();
    expect(useSurveyHistory.getState().value.map((e) => e.id)).toEqual(['abc123XYZ']);
  });

  it('lists the newest first and forgets a gone link', async () => {
    await noteSurvey('abc123XYZ');
    await noteSurvey('def456UVW');
    expect(useSurveyHistory.getState().value.map((e) => e.id)).toEqual(['def456UVW', 'abc123XYZ']);
    await forgetSurvey('def456UVW');
    expect(useSurveyHistory.getState().value.map((e) => e.id)).toEqual(['abc123XYZ']);
  });

  it('names a listed survey, keeps the name across a reload, and clears it', async () => {
    await noteSurvey('abc123XYZ');
    await renameSurvey('abc123XYZ', '  Belt 3 ');
    useSurveyHistory.setState({ value: [], hydrated: false });
    await useSurveyHistory.getState().hydrate();
    expect(useSurveyHistory.getState().value[0]?.name).toBe('Belt 3');

    await renameSurvey('abc123XYZ', '');
    expect(useSurveyHistory.getState().value[0]).not.toHaveProperty('name');
  });

  it('does not name a survey that is not in the list', async () => {
    await noteSurvey('abc123XYZ');
    await renameSurvey('def456UVW', 'Belt 3');
    expect(useSurveyHistory.getState().value).toEqual([
      expect.not.objectContaining({ name: expect.anything() }),
    ]);
  });
});
