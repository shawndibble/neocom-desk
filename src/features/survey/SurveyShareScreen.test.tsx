import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { takePendingScan } from './pendingScan';

const { addSurveyScan, loadSurvey } = vi.hoisted(() => ({
  addSurveyScan: vi.fn(),
  loadSurvey: vi.fn(),
}));
vi.mock('./surveyStore', () => ({ addSurveyScan, loadSurvey }));
vi.mock('./SurveyCharts', () => ({ SurveyCharts: () => <div data-testid="charts" /> }));

import { SurveyShareScreen } from './SurveyShareScreen';

const SCAN =
  'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km\nClear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km';
const SHRUNK = 'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km';
// An ore the survey never showed: another field.
const DIFFERENT = 'Blue Ice\t10\t1,000 m3\t1.00 ISK\t5 km';
const ID = 'abc123XYZ';
const EXPIRES = Date.UTC(2026, 9, 15);

function renderScreen() {
  return render(
    <MemoryRouter>
      <SurveyShareScreen shareId={ID} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  addSurveyScan.mockReset();
  loadSurvey.mockReset();
  addSurveyScan.mockResolvedValue(undefined);
  loadSurvey.mockResolvedValue({
    ok: true,
    expiresAt: EXPIRES,
    scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
  });
});

afterEach(cleanup);

describe('SurveyShareScreen', () => {
  it('shows the survey to a visitor with no session', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    expect(loadSurvey).toHaveBeenCalledWith(ID);
    expect(screen.getByText(/Paste a Survey Scanner copy anywhere on this page/)).toBeTruthy();
  });

  it('names the page once, and puts the way in in the header', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    expect(screen.getAllByText('Mining Survey')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Mining Survey' })).toBeTruthy();
    const banner = screen.getAllByRole('banner')[0];
    expect(within(banner).getByRole('link', { name: 'Neocom Desk' })).toHaveAttribute('href', '/');
    expect(
      await within(banner).findByRole('button', { name: 'Log in with EVE Online' })
    ).toBeTruthy();
  });

  it('adds a scan pasted anywhere on the page, to this survey, with no sign-in', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    // The page's paste listener is re-registered once the survey has loaded
    // (it needs the survey's expiry). A paste in the tick before that is
    // dropped, so keep pasting until the page is ready: a dropped paste never
    // reaches the store, so this adds exactly one scan.
    await waitFor(() => {
      fireEvent.paste(document.body, { clipboardData: { getData: () => SCAN } });
      expect(addSurveyScan).toHaveBeenCalledTimes(1);
    });
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: SCAN, expiresAt: EXPIRES });
  });

  it('adds a paste that only shrinks the field', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    await waitFor(() => {
      fireEvent.paste(document.body, { clipboardData: { getData: () => SHRUNK } });
      expect(addSurveyScan).toHaveBeenCalledTimes(1);
    });
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: SHRUNK, expiresAt: EXPIRES });
  });

  it('holds a different field for the login instead of adding it, and says why', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    await waitFor(() => {
      fireEvent.paste(document.body, { clipboardData: { getData: () => DIFFERENT } });
      expect(screen.getByText(/different field than this survey/i)).toBeTruthy();
    });
    expect(addSurveyScan).not.toHaveBeenCalled();
    expect(takePendingScan()).toBe(DIFFERENT);
  });

  it('ignores a paste that is not a survey scan', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    fireEvent.paste(document.body, { clipboardData: { getData: () => 'Tritanium\t100' } });
    expect(addSurveyScan).not.toHaveBeenCalled();
  });

  it('says so when the survey has expired', async () => {
    loadSurvey.mockResolvedValue({ ok: false, reason: 'not-found' });
    renderScreen();
    await screen.findByText('This survey has expired');
  });
});
