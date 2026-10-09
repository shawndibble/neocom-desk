import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { parseSurveyScan } from '@/engine/survey/parseScan';

const { loadSurvey } = vi.hoisted(() => ({ loadSurvey: vi.fn() }));
vi.mock('./surveyStore', () => ({ loadSurvey }));

import { SurveyPicker } from './SurveyPicker';
import { noteSurvey, useSurveyHistory } from './surveyHistory';

const SCAN =
  'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km\nClear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km';
const A = 'abc123XYZ';
const B = 'def456UVW';

beforeEach(async () => {
  loadSurvey.mockReset();
  loadSurvey.mockResolvedValue({
    ok: true,
    expiresAt: Date.UTC(2026, 9, 15),
    owner: null,
    scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
  });
  await db.settings.clear();
  useSurveyHistory.setState({ value: [], hydrated: false });
});

afterEach(cleanup);

describe('SurveyPicker', () => {
  it('is not shown while there is nothing to switch to', async () => {
    await noteSurvey(A);
    render(<SurveyPicker currentId={A} onPick={() => undefined} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('lists past surveys by ore, percent and time once opened, and switches to the pick', async () => {
    await noteSurvey(A);
    await noteSurvey(B);
    const onPick = vi.fn();
    render(<SurveyPicker currentId={A} onPick={onPick} />);
    expect(loadSurvey).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Your surveys' }));
    const options = await screen.findAllByRole('option');
    await waitFor(() => expect(loadSurvey).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(options[0].textContent).toContain('Clear Icicle · 0% mined'));

    // Newest first: B, then the one already in view.
    await userEvent.click(options[0]);
    expect(onPick).toHaveBeenCalledWith(B);
  });

  it('drops a survey whose link is gone from the history', async () => {
    await noteSurvey(A);
    await noteSurvey(B);
    loadSurvey.mockImplementation((id: string) =>
      Promise.resolve(
        id === A
          ? { ok: false, reason: 'not-found' }
          : { ok: true, expiresAt: 1, owner: null, scans: [] }
      )
    );
    render(<SurveyPicker currentId={B} onPick={() => undefined} />);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Your surveys' }));
    await waitFor(() =>
      expect(useSurveyHistory.getState().value.map((entry) => entry.id)).toEqual([B])
    );
  });

  it('removes a survey from the history without switching to it', async () => {
    await noteSurvey(A);
    await noteSurvey(B);
    const onPick = vi.fn();
    render(<SurveyPicker currentId={A} onPick={onPick} />);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Your surveys' }));
    const remove = await screen.findAllByRole('button', { name: /^Remove .* from your surveys$/ });
    expect(remove).toHaveLength(2);
    await userEvent.click(remove[0]);
    await waitFor(() =>
      expect(useSurveyHistory.getState().value.map((entry) => entry.id)).toEqual([A])
    );
    expect(onPick).not.toHaveBeenCalled();
  });
});
