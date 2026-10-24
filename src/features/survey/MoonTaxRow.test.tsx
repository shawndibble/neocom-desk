import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { MiningTaxAssignmentRecord } from '@/db';
import { createPayee } from '@/features/miningTax/payees';
import { useSurveyConnections } from '@/features/miningTax/surveyConnections';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { MoonTaxReadout, MoonTaxRow } from './MoonTaxRow';
import type { ConnectableSurvey } from './useSurveyConnection';

const { setSurveyTax } = vi.hoisted(() => ({ setSurveyTax: vi.fn() }));
vi.mock('./surveyStore', () => ({ setSurveyTax }));

const { autoAssignFromSurveys } = vi.hoisted(() => ({ autoAssignFromSurveys: vi.fn() }));
vi.mock('@/features/miningTax/surveyConnections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/miningTax/surveyConnections')>()),
  autoAssignFromSurveys,
}));

const BITUMENS = 45492;
vi.mock('@/sde/loadSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadSde')>()),
  loadMoonOreTypeIds: () => Promise.resolve([BITUMENS, 45494]),
  loadTypes: () =>
    Promise.resolve({ [BITUMENS]: { name: 'Bitumens' }, 45494: { name: 'Cobaltite' } }),
}));

const SYSTEM = 30000142;
vi.mock('@/features/route/placeSystem', () => ({
  resolvePlaceSystemId: () => Promise.resolve(SYSTEM),
}));

const NOW = Date.now();
const CONNECTABLE: ConnectableSurvey = {
  id: 'abc123XYZ',
  expiresAt: NOW + 7 * 24 * 60 * 60 * 1000,
  locationId: 40000001,
  summary: {
    firstAt: NOW - 60 * 60 * 1000,
    etaAt: NOW + 2 * 60 * 60 * 1000,
    finished: false,
    finishedAt: null,
    lastAt: NOW,
    oreNames: ['Bitumens', 'Veldspar'],
  },
};

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

const SURVEY = { id: 'abc123XYZ', expiresAt: 5000, published: null };

function renderRow(
  survey?: Parameters<typeof MoonTaxRow>[0]['survey'],
  connectable?: ConnectableSurvey
) {
  return render(
    <MemoryRouter initialEntries={['/mining/survey']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <MoonTaxRow characterId={7} survey={survey} connectable={connectable} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function type(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

beforeEach(async () => {
  await Promise.all([db.payees.clear(), db.settings.clear()]);
  useSurveyConnections.setState({ value: [], hydrated: false });
  setSurveyTax.mockReset();
  setSurveyTax.mockResolvedValue(undefined);
  autoAssignFromSurveys.mockReset();
  autoAssignFromSurveys.mockResolvedValue([]);
});
afterEach(cleanup);

describe('MoonTaxRow', () => {
  it('shows the rate and name as plain fields, with what the survey stored', () => {
    renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } });
    expect((screen.getByLabelText('Tax rate, percent') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('Who gets the tax') as HTMLInputElement).value).toBe('Moon Corp');
    expect(screen.queryByRole('button', { name: /tax rate|who gets the tax/i })).toBeNull();
  });

  it("fills in a known Payee's rate from its name and offers the Payees to complete", async () => {
    await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 8 });
    const { container } = renderRow();
    await waitFor(() => expect(container.querySelectorAll('datalist option')).toHaveLength(1));
    type('Who gets the tax', 'moon corp');
    await waitFor(() =>
      expect((screen.getByLabelText('Tax rate, percent') as HTMLInputElement).value).toBe('8')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/mining/tax'));
  });

  it('stays disabled until there is a name and a rate from 0 to 100, then creates the Payee', async () => {
    renderRow();
    const open = screen.getByRole('button', { name: 'Assign Taxes' });
    expect((open as HTMLButtonElement).disabled).toBe(true);
    type('Who gets the tax', 'New Corp');
    type('Tax rate, percent', '150');
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(true));
    type('Tax rate, percent', '12');
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    await waitFor(async () => expect(await db.payees.count()).toBe(1));
    expect((await db.payees.toArray())[0]).toMatchObject({ name: 'New Corp', defaultTaxPct: 12 });
  });

  it('stores a complete name and rate on the survey when focus leaves the pair, and only then', async () => {
    renderRow(SURVEY);
    const name = screen.getByLabelText('Who gets the tax');
    const rate = screen.getByLabelText('Tax rate, percent');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: 'Moon Corp' } });
    // Focus moving to the rate field is still inside the pair.
    fireEvent.blur(name, { relatedTarget: rate });
    fireEvent.focus(rate);
    fireEvent.change(rate, { target: { value: '8' } });
    expect(setSurveyTax).not.toHaveBeenCalled();
    fireEvent.blur(rate, { relatedTarget: document.body });
    await waitFor(() =>
      expect(setSurveyTax).toHaveBeenCalledWith({
        id: 'abc123XYZ',
        expiresAt: 5000,
        name: 'Moon Corp',
        pct: 8,
      })
    );
    expect(setSurveyTax).toHaveBeenCalledTimes(1);
  });

  it('does not store what the survey already has', async () => {
    renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } });
    await screen.findByLabelText('Tax rate, percent');
    expect(setSurveyTax).not.toHaveBeenCalled();
  });

  it('connects the moon in one click, staying on the survey and making the rate the Payee’s default', async () => {
    const mine = await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 5 });
    renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } }, CONNECTABLE);
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    expect(
      await screen.findByText(/Your ore from this moon will be assigned to Moon Corp at 8%/)
    ).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/mining/survey');
    expect((await db.payees.get(mine.id))?.defaultTaxPct).toBe(8);
    expect(useSurveyConnections.getState().value).toMatchObject([
      { surveyId: 'abc123XYZ', characterId: 7, payeeId: mine.id, taxPct: 8 },
    ]);
  });

  it('Undo puts back the default rate the owner’s click changed, and focus moves to Stop', async () => {
    const mine = await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 5 });
    renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } }, CONNECTABLE);
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    const stop = await screen.findByRole('button', { name: 'Stop' });
    await waitFor(() => expect(document.activeElement).toBe(stop));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.payees.get(mine.id))?.defaultTaxPct).toBe(5));
    expect(useSurveyConnections.getState().value).toEqual([]);
  });

  it('starts blank on a survey with no stored tax, whatever was set on another', () => {
    const first = renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } });
    expect((screen.getByLabelText('Tax rate, percent') as HTMLInputElement).value).toBe('8');
    first.unmount();
    renderRow(SURVEY);
    expect((screen.getByLabelText('Tax rate, percent') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Who gets the tax') as HTMLInputElement).value).toBe('');
  });
});

describe('MoonTaxReadout', () => {
  function renderReadout(connectable: ConnectableSurvey | null = CONNECTABLE) {
    return render(
      <MemoryRouter initialEntries={['/s/abc123XYZ']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <MoonTaxReadout
                  tax={{ name: 'Moon Corp', pct: 8 }}
                  connectable={connectable ?? undefined}
                />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  }

  afterEach(() => useActiveCharacter.setState({ activeCharacterId: null, hydrated: true }));

  it('shows the rate and who gets it, and logged out disables Assign Taxes with why', () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
    renderReadout();
    expect(screen.getByText('8%')).toBeTruthy();
    expect(screen.getByText('Moon Corp').className).not.toContain('text-accent');
    expect(screen.queryByRole('textbox')).toBeNull();
    const manage = screen.getByRole('button', { name: 'Assign Taxes' });
    expect(manage.getAttribute('aria-disabled')).toBe('true');
    expect(manage.getAttribute('aria-describedby')).toBe(screen.getByText('Log in to access').id);
    fireEvent.click(manage);
    expect(screen.getByTestId('where').textContent).toBe('/s/abc123XYZ');
    expect(useSurveyConnections.getState().value).toEqual([]);
  });

  it("connects the moon to the viewer's own Payee by that name in one click, keeping their rate", async () => {
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
    const mine = await createPayee(7, { name: 'moon corp', defaultTaxPct: 5 });
    renderReadout();
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    expect(await screen.findByText(/Auto-assigned until/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/s/abc123XYZ');
    expect(await db.payees.toArray()).toEqual([mine]);
    expect(useSurveyConnections.getState().value).toMatchObject([
      {
        surveyId: 'abc123XYZ',
        characterId: 7,
        payeeId: mine.id,
        taxPct: 8,
        systemId: SYSTEM,
        typeIds: [BITUMENS],
        untilMs: CONNECTABLE.summary.etaAt,
      },
    ]);
    expect(autoAssignFromSurveys).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Assign Taxes' })).toBeNull();
  });

  it('adds a missing Payee at the survey rate without asking, and Undo takes it all back', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
    renderReadout();
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    expect(await screen.findByText(/Added Moon Corp as a Payee at 8%\./)).toBeTruthy();
    expect(await db.payees.toArray()).toMatchObject([
      { characterId: 7, name: 'Moon Corp', defaultTaxPct: 8 },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await db.payees.count()).toBe(0));
    expect(useSurveyConnections.getState().value).toEqual([]);
    expect(await screen.findByRole('button', { name: 'Assign Taxes' })).toBeTruthy();
  });

  it('says how much of the already-mined ore it assigned', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
    await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 8 });
    autoAssignFromSurveys.mockResolvedValue([{ id: 'a1' } as MiningTaxAssignmentRecord]);
    renderReadout();
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    expect(await screen.findByText('Assigned 1 mining entry to Moon Corp.')).toBeTruthy();
  });

  it('Stop disconnects the moon', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
    await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 8 });
    renderReadout();
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    const manage = await screen.findByRole('button', { name: 'Assign Taxes' });
    await waitFor(() => expect(document.activeElement).toBe(manage));
    expect(useSurveyConnections.getState().value).toEqual([]);
  });

  it('says so and stays when the Payee cannot be added', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
    renderReadout();
    const add = vi.spyOn(db.payees, 'put').mockRejectedValueOnce(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't connect this moon to that Payee. Try again."
    );
    expect(useSurveyConnections.getState().value).toEqual([]);
    add.mockRestore();
  });

  it('without a survey to connect, opens the Tax tab on their own Payee', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
    await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 8 });
    renderReadout(null);
    fireEvent.click(screen.getByRole('button', { name: 'Assign Taxes' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/mining/tax'));
  });
});
