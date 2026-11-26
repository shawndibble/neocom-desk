import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import type { SharedPopEntry } from '@/features/character/calendarSharedPops';
import type { SharedPopView } from '@/sync/sharedPops';
import { SurveyPopLinkPrompt } from './SurveyPopLinkPrompt';
import { useDismissedPopLinks } from './surveyPref';

const { loadSharedPopsRead, linkSharedPopSurvey } = vi.hoisted(() => ({
  loadSharedPopsRead: vi.fn(),
  linkSharedPopSurvey: vi.fn(),
}));
vi.mock('@/features/character/calendarSharedPopsRead', () => ({ loadSharedPopsRead }));
vi.mock('@/sync/sharedPops', () => ({ linkSharedPopSurvey }));
vi.mock('@/features/corp/moons/keptSurveyScan', () => ({
  loadMoonOreTypeIdByName: async () =>
    new Map([
      ['Bitumens', 45492],
      ['Cobaltite', 45494],
    ]),
}));

const NOW = Date.now();
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const SURVEY_ID = 'abc234';

const entry = (
  id: string,
  over: Partial<SharedPopView> = {},
  name = 'Alpha Refinery'
): SharedPopEntry => ({
  pop: {
    id,
    extractionId: id,
    moonId: 1,
    structureId: 1_000_000_000_001,
    refineryName: name,
    solarSystemId: 30000142,
    popTime: 'ready',
    popAt: iso(NOW - 2 * H),
    readyAt: iso(NOW - 2 * H),
    fractured: false,
    startedAt: iso(NOW - 40 * H),
    expiresAt: iso(NOW + 30 * H),
    ore: [
      { typeId: 45492, quantity: 1 },
      { typeId: 45494, quantity: 1 },
    ],
    notes: '',
    ratePct: 10,
    corporationId: 98000001,
    syncedAt: iso(NOW),
    ...over,
  } as SharedPopView,
  moonName: null,
  corporation: { id: 98000001, name: 'Mining Co', ticker: 'MC' },
  ore: null,
});

const props = {
  surveyId: SURVEY_ID,
  oreNames: ['Bitumens', 'Cobaltite'],
  location: null,
};

beforeEach(async () => {
  loadSharedPopsRead.mockReset();
  linkSharedPopSurvey.mockReset().mockResolvedValue(undefined);
  await db.settings.clear();
  useDismissedPopLinks.setState({ value: [], hydrated: false });
});
afterEach(cleanup);

describe('SurveyPopLinkPrompt', () => {
  it('asks about the one pop whose ore matches, and links only on a click', async () => {
    loadSharedPopsRead.mockResolvedValue({ entries: [entry('p1')], corporations: [] });
    render(<SurveyPopLinkPrompt {...props} />);
    expect(
      await screen.findByText(/Is this scan from Alpha Refinery \(Mining Co\)\?/)
    ).toBeTruthy();
    expect(linkSharedPopSurvey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(linkSharedPopSurvey).toHaveBeenCalledWith('p1', SURVEY_ID, { onlyIfUnlinked: true })
    );
  });

  it('shows nothing with no candidates, or once a pop already shows this Survey', async () => {
    loadSharedPopsRead.mockResolvedValue({ entries: [entry('p1')], corporations: [] });
    loadSharedPopsRead.mockResolvedValue({ entries: [], corporations: [] });
    const { rerender, container } = render(<SurveyPopLinkPrompt {...props} />);
    await waitFor(() => expect(loadSharedPopsRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.textContent).toBe(''));
    loadSharedPopsRead.mockResolvedValue({
      entries: [entry('p1'), entry('p2', { surveyId: SURVEY_ID })],
      corporations: [],
    });
    rerender(<SurveyPopLinkPrompt {...props} surveyId="def567" />);
    await waitFor(() => expect(loadSharedPopsRead).toHaveBeenCalled());
    expect(container.textContent).toContain('Is this scan from');
    rerender(<SurveyPopLinkPrompt {...props} />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('remembers "Not this one" for that Survey on this device', async () => {
    loadSharedPopsRead.mockResolvedValue({ entries: [entry('p1')], corporations: [] });
    const first = render(<SurveyPopLinkPrompt {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Not this one' }));
    await waitFor(() => expect(first.container.textContent).toBe(''));
    first.unmount();
    useDismissedPopLinks.setState({ hydrated: false });
    loadSharedPopsRead.mockClear();
    const again = render(<SurveyPopLinkPrompt {...props} />);
    await waitFor(() => expect(useDismissedPopLinks.getState().hydrated).toBe(true));
    expect(loadSharedPopsRead).not.toHaveBeenCalled();
    expect(again.container.textContent).toBe('');
  });

  it('offers a pick when several pops match equally, and links the chosen one', async () => {
    loadSharedPopsRead.mockResolvedValue({
      entries: [entry('p1'), entry('p2', {}, 'Beta Refinery')],
      corporations: [],
    });
    render(<SurveyPopLinkPrompt {...props} />);
    expect(await screen.findByText(/one of these shared moon pops/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Link' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'None of these' })).toBeTruthy();
  });

  it('reloads the pops from the server and drops the prompt when the pop was linked meanwhile', async () => {
    loadSharedPopsRead
      .mockResolvedValueOnce({ entries: [entry('p1')], corporations: [] })
      .mockResolvedValue({ entries: [entry('p1', { surveyId: 'zzz999' })], corporations: [] });
    linkSharedPopSurvey.mockRejectedValue({
      code: 'functions/failed-precondition',
      message: 'already linked',
    });
    const { container } = render(<SurveyPopLinkPrompt {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link' }));
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(loadSharedPopsRead).toHaveBeenLastCalledWith(expect.any(Number), 0);
  });

  it('says so when the Survey itself is gone, which is also a failed precondition', async () => {
    loadSharedPopsRead.mockResolvedValue({ entries: [entry('p1')], corporations: [] });
    linkSharedPopSurvey.mockRejectedValue({
      code: 'functions/failed-precondition',
      message: 'That Survey does not exist',
    });
    render(<SurveyPopLinkPrompt {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(loadSharedPopsRead).toHaveBeenCalledTimes(1);
  });

  it('says so when linking fails for another reason', async () => {
    loadSharedPopsRead.mockResolvedValue({ entries: [entry('p1')], corporations: [] });
    linkSharedPopSurvey.mockRejectedValue({ code: 'functions/unavailable' });
    render(<SurveyPopLinkPrompt {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
