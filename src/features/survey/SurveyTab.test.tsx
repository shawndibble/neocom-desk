import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { stashPendingScan, takePendingScan } from './pendingScan';
import { noteSubmittedScan } from './submitted';
import { useSurveyHistory } from './surveyHistory';
import { useCurrentSurveyId } from './surveyPref';

const { startSurvey, addSurveyScan, loadSurvey, setSurveyScanIgnored } = vi.hoisted(() => ({
  startSurvey: vi.fn(),
  addSurveyScan: vi.fn(),
  loadSurvey: vi.fn(),
  setSurveyScanIgnored: vi.fn(),
}));
vi.mock('./surveyStore', () => ({
  startSurvey,
  addSurveyScan,
  loadSurvey,
  setSurveyScanIgnored,
}));
vi.mock('@/features/share/shareStore', () => ({
  shareUrl: (id: string) => `https://neocomdesk.test/s/${id}`,
}));
// The info panel has its own test; here only who sees it editable matters.
vi.mock('./useHasMoonOre', () => ({ useHasMoonOre: () => true }));
vi.mock('./SurveyInfoPanel', () => ({
  SurveyInfoEditor: () => <div data-testid="tax-edit" />,
  SurveyInfoReadout: ({ tax }: { tax: { name: string } | null }) =>
    tax === null ? null : <div data-testid="tax-readout">{tax.name}</div>,
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
      <SurveyTab tabBar={<div />} tabsId="t" />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  startSurvey.mockReset();
  addSurveyScan.mockReset();
  loadSurvey.mockReset();
  setSurveyScanIgnored.mockReset();
  setSurveyScanIgnored.mockResolvedValue(undefined);
  startSurvey.mockResolvedValue({
    id: ID,
    url: `https://neocomdesk.test/s/${ID}`,
    expiresAt: EXPIRES,
  });
  addSurveyScan.mockResolvedValue(undefined);
  loadSurvey.mockResolvedValue({
    ok: true,
    ignored: new Set(),
    expiresAt: EXPIRES,
    owner: 'Shawn Dibble',
    tax: null,
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
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: SCAN,
      expiresAt: EXPIRES,
      by: 'Shawn Dibble',
    });
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
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: SCAN,
      expiresAt: EXPIRES,
      by: 'Shawn Dibble',
    });
  });

  it('adds a paste that only shrinks the field to the survey in view, with no question', async () => {
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    await screen.findByText('0% mined');
    pasteInApp(SHRUNK);
    await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: SHRUNK,
      expiresAt: EXPIRES,
      by: 'Shawn Dibble',
    });
    expect(startSurvey).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: /different field/i })).toBeNull();
  });

  describe('first scan with a section missing', () => {
    // The survey shows two ores; the paste has only one, as when a group is left collapsed.
    const TWO_ORES = `${SCAN}
Blue Ice	10	1,000 m3	1.00 ISK	5 km`;
    beforeEach(async () => {
      loadSurvey.mockResolvedValue({
        ok: true,
        ignored: new Set(),
        expiresAt: EXPIRES,
        owner: 'Shawn Dibble',
        tax: null,
        scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(TWO_ORES)! }],
      });
      await useCurrentSurveyId.getState().setValue(ID);
    });

    it('asks to confirm every section is expanded before adding it', async () => {
      renderTab();
      await screen.findByText(/mined/);
      pasteInApp(SHRUNK);
      const check = await screen.findByRole('group', { name: /every section is expanded/i });
      expect(check.textContent).toContain('Blue Ice is no longer on this report');
      expect(addSurveyScan).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'All are expanded' }));
      await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
      expect(addSurveyScan).toHaveBeenCalledWith(
        expect.objectContaining({ id: ID, text: SHRUNK, by: 'Shawn Dibble' })
      );
    });

    it('does not ask about an ore the latest scan already lacked', async () => {
      loadSurvey.mockResolvedValue({
        ok: true,
        ignored: new Set(),
        expiresAt: EXPIRES,
        owner: 'Shawn Dibble',
        tax: null,
        scans: [
          { at: Date.UTC(2026, 9, 8, 17), rocks: parseSurveyScan(TWO_ORES)! },
          { at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! },
        ],
      });
      renderTab();
      await screen.findByText(/mined/);
      pasteInApp(SHRUNK);
      await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('group', { name: /every section is expanded/i })).toBeNull();
    });

    it('adds nothing when the upload is cancelled', async () => {
      renderTab();
      await screen.findByText(/mined/);
      pasteInApp(SHRUNK);
      await screen.findByRole('group', { name: /every section is expanded/i });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
      expect(screen.queryByRole('group', { name: /every section is expanded/i })).toBeNull();
      expect(addSurveyScan).not.toHaveBeenCalled();
    });

    it('does not ask a pilot who has already added a scan', async () => {
      noteSubmittedScan();
      renderTab();
      await screen.findByText(/mined/);
      pasteInApp(SHRUNK);
      await waitFor(() => expect(addSurveyScan).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('group', { name: /every section is expanded/i })).toBeNull();
    });
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
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: DIFFERENT,
      expiresAt: EXPIRES,
      by: 'Shawn Dibble',
    });
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
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: DIFFERENT,
      expiresAt: EXPIRES,
      by: 'Shawn Dibble',
    });
    expect(startSurvey).not.toHaveBeenCalled();
  });

  it("starts a new survey at once for a different field when the survey in view isn't theirs", async () => {
    loadSurvey.mockResolvedValue({
      ok: true,
      ignored: new Set(),
      expiresAt: EXPIRES,
      owner: 'Someone Else',
      tax: null,
      scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
    });
    await useCurrentSurveyId.getState().setValue('other1234');
    renderTab();
    await screen.findByText('0% mined');
    pasteInApp(DIFFERENT);
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('group', { name: /different field/i })).toBeNull();
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: DIFFERENT,
      expiresAt: EXPIRES,
      by: 'Shawn Dibble',
    });
  });

  it('starts a survey from the scan a shared page held for the login, once', async () => {
    stashPendingScan(DIFFERENT);
    renderTab();
    await waitFor(() => expect(startSurvey).toHaveBeenCalledTimes(1));
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: DIFFERENT,
      expiresAt: EXPIRES,
      by: 'Shawn Dibble',
    });
    expect(localStorage.getItem('miningSurveyPendingScan')).toBeNull();
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

  it("lets the survey's owner edit the moon tax", async () => {
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    await screen.findByTestId('tax-edit');
    expect(screen.queryByTestId('tax-readout')).toBeNull();
  });

  it("shows another pilot's survey tax read-only, so theirs can't overwrite it", async () => {
    loadSurvey.mockResolvedValue({
      ok: true,
      ignored: new Set(),
      expiresAt: EXPIRES,
      owner: 'Someone Else',
      tax: { name: 'Moon Corp', pct: 8 },
      scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
    });
    await useCurrentSurveyId.getState().setValue(ID);
    renderTab();
    expect((await screen.findByTestId('tax-readout')).textContent).toBe('Moon Corp');
    expect(screen.queryByTestId('tax-edit')).toBeNull();
  });

  describe('removing a scan', () => {
    const twoScans = (owner: string) => ({
      ok: true,
      ignored: new Set(),
      expiresAt: EXPIRES,
      owner,
      tax: null,
      scans: [
        { id: 'a', at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! },
        { id: 'b', at: Date.UTC(2026, 9, 8, 18, 5), rocks: parseSurveyScan(SHRUNK)! },
      ],
    });

    it("lets the survey's owner remove a scan, storing it on the survey and reloading", async () => {
      loadSurvey.mockResolvedValue(twoScans('Shawn Dibble'));
      await useCurrentSurveyId.getState().setValue(ID);
      renderTab();
      fireEvent.click(await screen.findByText('2 scans', { selector: 'summary' }));
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
      await waitFor(() =>
        expect(setSurveyScanIgnored).toHaveBeenCalledWith({
          id: ID,
          expiresAt: EXPIRES,
          scanId: 'b',
          ignored: true,
        })
      );
    });

    it('says so when the removal could not be stored', async () => {
      loadSurvey.mockResolvedValue(twoScans('Shawn Dibble'));
      setSurveyScanIgnored.mockRejectedValue(new Error('permission-denied'));
      await useCurrentSurveyId.getState().setValue(ID);
      renderTab();
      fireEvent.click(await screen.findByText('2 scans', { selector: 'summary' }));
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
      expect((await screen.findByRole('alert')).textContent).toContain("Couldn't change that scan");
    });

    it("offers no removal on another pilot's survey", async () => {
      loadSurvey.mockResolvedValue(twoScans('Someone Else'));
      await useCurrentSurveyId.getState().setValue(ID);
      const { container } = renderTab();
      await screen.findByText(/mined/);
      expect(container.querySelector('details')).toBeNull();
    });
  });
});
