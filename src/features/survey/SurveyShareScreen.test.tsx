import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { takePendingScan } from './pendingScan';
import { noteStartedHere } from './startedHere';

const { addSurveyScan, loadSurvey, setSurveyInfo, setSurveyTax, setSurveyScanIgnored } = vi.hoisted(
  () => ({
    addSurveyScan: vi.fn(),
    loadSurvey: vi.fn(),
    setSurveyInfo: vi.fn(),
    setSurveyTax: vi.fn(),
    setSurveyScanIgnored: vi.fn(),
  })
);
vi.mock('./surveyStore', async () => ({
  ...(await vi.importActual<object>('./surveyStore')),
  addSurveyScan,
  loadSurvey,
  setSurveyInfo,
  setSurveyTax,
  setSurveyScanIgnored,
}));
vi.mock('./submitterName', () => ({ submitterName: async () => null }));
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
  setSurveyInfo.mockReset().mockResolvedValue(undefined);
  setSurveyTax.mockReset().mockResolvedValue(undefined);
  addSurveyScan.mockReset();
  loadSurvey.mockReset();
  addSurveyScan.mockResolvedValue(undefined);
  loadSurvey.mockResolvedValue({
    ok: true,
    ignored: new Set(),
    expiresAt: EXPIRES,
    scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
  });
});

afterEach(cleanup);

/** The panel starts folded on a survey this device just started with no details: open it. */
async function openDetails() {
  fireEvent.click(await screen.findByRole('button', { name: 'Show additional information' }));
}

describe('SurveyShareScreen details', () => {
  it('lets the device that started the survey set its details, with no account', async () => {
    noteStartedHere(ID);
    renderScreen();
    await openDetails();
    const notes = await screen.findByLabelText('Notes (markdown supported)');
    fireEvent.change(notes, { target: { value: 'Dock at the Athanor' } });
    fireEvent.blur(notes);
    await waitFor(() =>
      expect(setSurveyInfo).toHaveBeenCalledWith({
        id: ID,
        expiresAt: EXPIRES,
        location: null,
        notes: 'Dock at the Athanor',
        characterId: undefined,
      })
    );
  });

  it('stores the moon tax once it has a name and a rate', async () => {
    noteStartedHere(ID);
    renderScreen();
    await openDetails();
    fireEvent.change(await screen.findByLabelText('Moon tax payee'), {
      target: { value: 'Bob Corp' },
    });
    const rate = screen.getByLabelText('Moon tax rate (%)');
    fireEvent.change(rate, { target: { value: '10' } });
    fireEvent.blur(rate);
    await waitFor(() =>
      expect(setSurveyTax).toHaveBeenCalledWith({
        id: ID,
        expiresAt: EXPIRES,
        name: 'Bob Corp',
        pct: 10,
        characterId: undefined,
      })
    );
    expect(setSurveyInfo).not.toHaveBeenCalled();
  });

  it('offers no editor to anyone else', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    expect(screen.queryByLabelText('Moon tax payee')).toBeNull();
  });

  it('starts folded when this device just started the survey and no details are set', async () => {
    noteStartedHere(ID);
    renderScreen();
    await screen.findByRole('button', { name: 'Show additional information' });
    expect(screen.queryByLabelText('Notes (markdown supported)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show additional information' }));
    expect(screen.getByLabelText('Notes (markdown supported)')).toBeTruthy();
    // And the pilot can fold it again.
    fireEvent.click(screen.getByRole('button', { name: 'Hide additional information' }));
    expect(screen.queryByLabelText('Notes (markdown supported)')).toBeNull();
  });

  it('starts open when the survey already has details', async () => {
    noteStartedHere(ID);
    loadSurvey.mockResolvedValue({
      ok: true,
      ignored: new Set(),
      expiresAt: EXPIRES,
      info: { location: null, notes: 'Dock at the Athanor' },
      scans: [{ at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! }],
    });
    renderScreen();
    expect(await screen.findByLabelText('Notes (markdown supported)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide additional information' })).toBeTruthy();
  });
});

describe('SurveyShareScreen as its signed-in owner', () => {
  beforeEach(async () => {
    await db.characters.put({ characterId: 7, name: 'Shawn Dibble', ownerHash: 'h', addedAt: 1 });
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
  });
  afterEach(async () => {
    await db.characters.clear();
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  });

  const twoScans = (owner: string) => ({
    ok: true,
    owner,
    ignored: new Set<string>(),
    expiresAt: EXPIRES,
    scans: [
      { id: 's1', at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! },
      { id: 's2', at: Date.UTC(2026, 9, 8, 19), rocks: parseSurveyScan(SHRUNK)! },
    ],
  });

  it('shows the details editor and lets the owner set a scan aside', async () => {
    loadSurvey.mockResolvedValue(twoScans('Shawn Dibble'));
    setSurveyScanIgnored.mockResolvedValue(undefined);
    renderScreen();
    expect(await screen.findByLabelText('Notes (markdown supported)')).toBeTruthy();
    fireEvent.click(screen.getByText('2 scans', { selector: 'h2' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await waitFor(() =>
      expect(setSurveyScanIgnored).toHaveBeenCalledWith({
        id: ID,
        expiresAt: EXPIRES,
        // The list is newest first.
        scanId: 's2',
        ignored: true,
        characterId: 7,
      })
    );
  });

  it('lets the device that started the survey set a scan aside with no account', async () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
    noteStartedHere(ID);
    loadSurvey.mockResolvedValue(twoScans('Someone Else'));
    setSurveyScanIgnored.mockResolvedValue(undefined);
    renderScreen();
    fireEvent.click(await screen.findByText('2 scans', { selector: 'h2' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await waitFor(() =>
      expect(setSurveyScanIgnored).toHaveBeenCalledWith({
        id: ID,
        expiresAt: EXPIRES,
        scanId: 's2',
        ignored: true,
        characterId: undefined,
      })
    );
  });

  it('keeps that device in charge after signing in, before the survey names the pilot', async () => {
    noteStartedHere(ID);
    // Started with no account, so it names no owner for the signed-in Character to match.
    loadSurvey.mockResolvedValue(twoScans(null as unknown as string));
    setSurveyScanIgnored.mockResolvedValue(undefined);
    renderScreen();
    await openDetails();
    expect(await screen.findByLabelText('Notes (markdown supported)')).toBeTruthy();
    fireEvent.click(screen.getByText('2 scans', { selector: 'h2' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await waitFor(() =>
      expect(setSurveyScanIgnored).toHaveBeenCalledWith(expect.objectContaining({ characterId: 7 }))
    );
  });

  it("offers neither to a pilot who isn't the survey's owner", async () => {
    loadSurvey.mockResolvedValue(twoScans('Someone Else'));
    renderScreen();
    await screen.findByText(/mined/);
    expect(screen.queryByLabelText('Notes (markdown supported)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('SurveyShareScreen', () => {
  it('shows the survey to a visitor with no session', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    expect(loadSurvey).toHaveBeenCalledWith(ID);
    expect(screen.getByText(/Paste a Survey Scanner copy anywhere on this page/)).toBeTruthy();
  });

  it('offers the chart view select on the public page', async () => {
    loadSurvey.mockResolvedValue({
      ok: true,
      ignored: new Set(),
      expiresAt: EXPIRES,
      scans: [
        { at: Date.UTC(2026, 9, 8, 18), rocks: parseSurveyScan(SCAN)! },
        { at: Date.UTC(2026, 9, 8, 18, 10), rocks: parseSurveyScan(SHRUNK)! },
      ],
    });
    renderScreen();
    expect(await screen.findByRole('combobox', { name: 'Chart view' })).toBeTruthy();
  });

  it('names the page once, and puts the way in in the header', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    expect(screen.getAllByText('Mining Survey')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Mining Survey' })).toBeTruthy();
    const banner = screen.getAllByRole('banner')[0];
    expect(within(banner).getByRole('link', { name: 'Neocom Desk' })).toHaveAttribute('href', '/');
    expect(await within(banner).findByRole('button', { name: 'Log in' })).toBeTruthy();
  });

  it('adds a scan pasted anywhere on the page, to this survey, with no sign-in', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    fireEvent.paste(document.body, { clipboardData: { getData: () => SCAN } });
    await waitFor(() => {
      expect(addSurveyScan).toHaveBeenCalled();
    });
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: SCAN,
      expiresAt: EXPIRES,
      by: null,
    });
  });

  it('adds a paste that only shrinks the field', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    fireEvent.paste(document.body, { clipboardData: { getData: () => SHRUNK } });
    await waitFor(() => {
      expect(addSurveyScan).toHaveBeenCalled();
    });
    expect(addSurveyScan).toHaveBeenCalledWith({
      id: ID,
      text: SHRUNK,
      expiresAt: EXPIRES,
      by: null,
    });
  });

  it('holds a different field for the login instead of adding it, and says why', async () => {
    renderScreen();
    await screen.findByText('0% mined');
    fireEvent.paste(document.body, { clipboardData: { getData: () => DIFFERENT } });
    await waitFor(() => {
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
