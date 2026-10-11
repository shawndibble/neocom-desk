import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { SurveyNameTitle } from './SurveyNameTitle';
import { noteSurvey, renameSurvey, useSurveyHistory } from './surveyHistory';

const A = 'abc123XYZ';

beforeEach(async () => {
  await db.settings.clear();
  useSurveyHistory.setState({ value: [], hydrated: false });
});

afterEach(cleanup);

const nameOf = () => useSurveyHistory.getState().value[0]?.name;

describe('SurveyNameTitle', () => {
  it('shows the plain title, with no pencil, for a survey not in the pilot’s recents', () => {
    render(<SurveyNameTitle id={A} />);
    expect(screen.getByText('Mining Survey')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names an unnamed survey: click, type, Enter, and focus goes back to the title', async () => {
    await noteSurvey(A);
    render(<SurveyNameTitle id={A} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mining Survey, rename' }));
    const field = screen.getByRole('textbox', { name: 'Survey name' });
    await userEvent.type(field, 'Belt 3{Enter}');
    await waitFor(() => expect(nameOf()).toBe('Belt 3'));
    const title = await screen.findByRole('button', { name: 'Belt 3, rename' });
    expect(title.className).toContain('text-accent');
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it('saves on blur, and Esc leaves the name as it was', async () => {
    await noteSurvey(A);
    await renameSurvey(A, 'Belt 3');
    render(<SurveyNameTitle id={A} />);
    await userEvent.click(screen.getByRole('button', { name: 'Belt 3, rename' }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Moon{Escape}');
    expect(await screen.findByRole('button', { name: 'Belt 3, rename' })).toBeDefined();
    expect(nameOf()).toBe('Belt 3');

    await userEvent.click(screen.getByRole('button', { name: 'Belt 3, rename' }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Moon');
    await userEvent.tab();
    await waitFor(() => expect(nameOf()).toBe('Moon'));
  });

  it('clearing the name goes back to Mining Survey', async () => {
    await noteSurvey(A);
    await renameSurvey(A, 'Belt 3');
    render(<SurveyNameTitle id={A} />);
    await userEvent.click(screen.getByRole('button', { name: 'Belt 3, rename' }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Mining Survey, rename' })).toBeDefined();
    expect(useSurveyHistory.getState().value[0]).not.toHaveProperty('name');
  });
});
