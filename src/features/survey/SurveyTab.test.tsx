import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { stashPendingScan, takePendingScan } from './pendingScan';
import { useSurveyHistory } from './surveyHistory';
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
// Its own test covers the ledger read; here it would reach for ESI.
vi.mock('./YourShareRow', () => ({ YourShareRow: () => null }));
vi.mock('./SurveyCharts', () => ({ SurveyCharts: () => <div data-testid="charts" /> }));

import { SurveyTab } from './SurveyTab';

const SCAN =
  'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km\nClear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km';
// Rocks only shrink: one rock gone, the other untouched.
const SHRUNK = 'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km';
// An ore the survey never showed: another field.
const DIFFERENT = 'Blue Ice\t10\t1,000 m3\t1.00 ISK\t5 km';
const ID = 'abc123XYZ';
const EXPIRES = Date.UTC(2026, 9, 15);

const nav: { go: NavigateFunction } = { go: () => undefined };
function Grab() {
  const navigate = useNavigate();
  useEffect(() => {
    nav.go = navigate;
  }, [navigate]);
  return null;
}
/** A paste anywhere in the app: `GlobalPasteRouter` sends the text here in the route state. */
function pasteInApp(text: string) {
  act(() => {
    void nav.go('/mining/survey', { state: { surveyScanText: text } });
  });
}

function renderTab(entry: string | { pathname: string; state: unknown } = '/mining/survey') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Grab />
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
    owner: 'Shawn Dibble',
    scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
  });
  localStorage.clear();
  await db.settings.clear();
  await db.characters.clear();
  await db.characters.put({ characterId: 7, name: 'Shawn Dibble', ownerHash: 'h', addedAt: 1 });
  useSurveyHistory.setState({ value: [], hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
  await useCurrentSurveyId.getState().setValue(null);
});

afterEach(cleanup);

describe('SurveyTab', () => {
  it('pasting something that is not a scan says so and starts no survey', async () => {
    renderTab();
    await screen.findByText('No survey yet');
    pasteInApp('Tritanium\t100');
    expect((await screen.findByRole('alert')).textContent).toContain("isn't a Survey Scanner copy");
    expect(startSurvey).not.toHaveBeenCalled();
    expect(addSurveyScan).not.toHaveBeenCalled();
  });

  it('starts a survey on the first pasted scan, then adds the scan to it', async () => {
    renderTab();
    await screen.findByText('No survey yet');
    pasteInApp(SCAN);
    await screen.findByText('0% mined');
    // The survey renders from `loadSurvey` before the paste's add settles; wait for it so it can't leak into the next test.
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(startSurvey).toHaveBeenCalledWith({ characterId: 7, ownerName: 'Shawn Dibble' });
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: SCAN, expiresAt: EXPIRES });
    expect(useCurrentSurveyId.getState().value).toBe(ID);
  });

  it('adds to the survey it is already tracking instead of starting another', async () => {
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    await screen.findByText('0% mined');
    pasteInApp(SCAN);
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(startSurvey).not.toHaveBeenCalled();
  });

  it('adds a scan the app-wide paste router carried here', async () => {
    renderTab({ pathname: '/mining/survey', state: { surveyScanText: SCAN } });
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: SCAN, expiresAt: EXPIRES });
  });

  it('adds a paste that only shrinks the field to the survey in view, with no question', async () => {
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    await screen.findByText('0% mined');
    pasteInApp(SHRUNK);
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: SHRUNK, expiresAt: EXPIRES });
    expect(startSurvey).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: /different field/i })).toBeNull();
  });

  it("asks the owner what to do with a different field, and 'Create new survey' starts one", async () => {
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    await screen.findByText('0% mined');
    pasteInApp(DIFFERENT);
    await screen.findByRole('group', { name: /different field/i });
    expect(addSurveyScan).not.toHaveBeenCalled();
    expect(startSurvey).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Create new survey' }));
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: DIFFERENT, expiresAt: EXPIRES });
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /different field/i })).toBeNull()
    );
  });

  it("'Add to existing survey' puts the different field on the survey in view anyway", async () => {
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    await screen.findByText('0% mined');
    pasteInApp(DIFFERENT);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to existing survey' }));
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: DIFFERENT, expiresAt: EXPIRES });
    expect(startSurvey).not.toHaveBeenCalled();
  });

  it("starts a new survey at once for a different field when the survey in view isn't theirs", async () => {
    loadSurvey.mockResolvedValue({
      ok: true,
      expiresAt: EXPIRES,
      owner: 'Someone Else',
      scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
    });
    await useCurrentSurveyId.getState().setValue('other1234');
    renderTab();
    await screen.findByText('0% mined');
    pasteInApp(DIFFERENT);
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('group', { name: /different field/i })).toBeNull();
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: DIFFERENT, expiresAt: EXPIRES });
  });

  it('starts a survey from the scan a shared page held for the login, once', async () => {
    stashPendingScan(DIFFERENT);
    renderTab();
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({ id: ID, text: DIFFERENT, expiresAt: EXPIRES });
    expect(localStorage.length).toBe(0);
  });

  it('keeps the held scan for the next visit when starting the survey fails', async () => {
    startSurvey.mockRejectedValue(new Error('no session yet'));
    stashPendingScan(DIFFERENT);
    renderTab();
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(takePendingScan()).toBe(DIFFERENT));
  });

  it('starts a new survey when the tracked one has expired', async () => {
    await useCurrentSurveyId.getState().setValue('oldOld123');
    loadSurvey.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    loadSurvey.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    renderTab();
    await screen.findByText('This survey has expired');
    pasteInApp(SCAN);
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    expect(useCurrentSurveyId.getState().value).toBe(ID);
  });
});
