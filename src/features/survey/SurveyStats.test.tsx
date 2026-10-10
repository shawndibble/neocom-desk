import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { summarizeSurvey } from '@/engine/survey/series';
import { SurveyStats } from './SurveyStats';
import { useDoneAtLocal } from './surveyPref';

const T0 = Date.UTC(2026, 9, 8, 18);
const summary = summarizeSurvey([
  { at: T0, rocks: [{ ore: 'Veldspar', volume: 2000 }] },
  { at: T0 + 600_000, rocks: [{ ore: 'Veldspar', volume: 1000 }] },
])!;

afterEach(() => {
  cleanup();
  useDoneAtLocal.setState({ value: false });
});

describe('SurveyStats Done at', () => {
  it('shows EVE time, and a click switches it to local time and back', async () => {
    render(<SurveyStats summary={summary} />);
    const button = screen.getByRole('button', { name: /EVE$/ });
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('button', { name: /EVE$/ })).toBeNull());
    const local = screen.getByRole('button');
    expect(local.textContent).not.toMatch(/local/i);
    expect(local.className).not.toMatch(/underline/);
    fireEvent.click(local);
    await waitFor(() => expect(screen.getByRole('button', { name: /EVE$/ })).toBeTruthy());
  });
});
