import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCurrentSurveyId } from './surveyPref';

const { startSurvey, addSurveyScan, loadSurvey } = vi.hoisted(() => ({
  startSurvey: vi.fn(),
  addSurveyScan: vi.fn(),
  loadSurvey: vi.fn(),
}));
vi.mock('./surveyStore', () => ({ startSurvey, addSurveyScan, loadSurvey }));
vi.mock('@/features/share/shareStore', () => ({
  shareUrl: (id: string) => `https://neocomdesk.test/share/${id}`,
}));
vi.mock('./SurveyCharts', () => ({ SurveyCharts: () => <div data-testid="charts" /> }));

import { SurveyTab } from './SurveyTab';

const SCAN =
  'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km\nClear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km';
const ID = 'abc123XYZ';
const EXPIRES = Date.UTC(2026, 9, 15);

function renderTab(entry: string | { pathname: string; state: unknown } = '/mining/survey') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SurveyTab tabBar={<div />} />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  startSurvey.mockReset();
  addSurveyScan.mockReset();
  loadSurvey.mockReset();
  startSurvey.mockResolvedValue({
    id: ID,
    url: `https://neocomdesk.test/share/${ID}`,
    expiresAt: EXPIRES,
  });
  addSurveyScan.mockResolvedValue(undefined);
  loadSurvey.mockResolvedValue({
    ok: true,
    expiresAt: EXPIRES,
    scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
  });
  useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
  await useCurrentSurveyId.getState().setValue(null);
});

afterEach(cleanup);

describe('SurveyTab', () => {
  it('starts a survey on the first pasted scan, then adds the scan to it', async () => {
    renderTab();
    await screen.findByText('No survey yet');
    fireEvent.paste(screen.getByLabelText('Survey scan'), {
      clipboardData: { getData: () => SCAN },
    });
    await screen.findByText('0% mined');
    expect(startSurvey).toHaveBeenCalledWith({ characterId: 7 });
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: SCAN, expiresAt: EXPIRES });
    expect(useCurrentSurveyId.getState().value).toBe(ID);
  });

  it('adds to the survey it is already tracking instead of starting another', async () => {
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    await screen.findByText('0% mined');
    fireEvent.paste(screen.getByLabelText('Survey scan'), {
      clipboardData: { getData: () => SCAN },
    });
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(startSurvey).not.toHaveBeenCalled();
  });

  it('adds a scan the app-wide paste router carried here', async () => {
    renderTab({ pathname: '/mining/survey', state: { surveyScanText: SCAN } });
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: SCAN, expiresAt: EXPIRES });
  });

  it('starts a new survey when the tracked one has expired', async () => {
    await useCurrentSurveyId.getState().setValue('oldOld123');
    loadSurvey.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    loadSurvey.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    renderTab();
    await screen.findByText('This survey has expired');
    fireEvent.paste(screen.getByLabelText('Survey scan'), {
      clipboardData: { getData: () => SCAN },
    });
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    expect(useCurrentSurveyId.getState().value).toBe(ID);
  });
});
