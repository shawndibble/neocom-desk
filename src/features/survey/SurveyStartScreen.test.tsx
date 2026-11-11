import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const { addSurveyScan, startSurvey, resolvePayeeId, resolveTypedPayee, resolvePlaceId } =
  vi.hoisted(() => ({
    addSurveyScan: vi.fn(),
    startSurvey: vi.fn(),
    resolvePayeeId: vi.fn(),
    resolveTypedPayee: vi.fn(),
    resolvePlaceId: vi.fn(),
  }));
vi.mock('./surveyStore', async () => ({
  ...(await vi.importActual<object>('./surveyStore')),
  addSurveyScan,
  startSurvey,
}));
vi.mock('./startLinkNames', () => ({
  resolvePayeeId,
  resolveTypedPayee,
  resolvePlaceId,
  nameIds: async (_fields: unknown, info: unknown) => info,
}));
vi.mock('./submitterName', () => ({ submitterName: async () => null }));
// The real picker searches the whole SDE; its own tests cover that.
vi.mock('./SurveyLocationPicker', () => ({
  SurveyLocationPicker: ({
    value,
    characterId,
  }: {
    value: { name: string } | null;
    characterId: number | null;
  }) => <div data-testid="picker">{`${value?.name ?? ''}|${characterId ?? 'no-login'}`}</div>,
}));

import { SurveyStartScreen } from './SurveyStartScreen';

const SCAN = 'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km';
const EXPIRES = Date.UTC(2026, 9, 15);

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderScreen(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/survey${search}`]}>
      <Routes>
        <Route path="/survey" element={<SurveyStartScreen />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

// The paste listener is rebound in a passive effect whenever a name resolves, so let those effects
// flush first: a paste fired between the render and the rebind reaches the stale listener.
const pasteScan = async () => {
  await act(async () => {});
  fireEvent.paste(document.body, { clipboardData: { getData: () => SCAN } });
};

beforeEach(async () => {
  localStorage.clear();
  await db.characters.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  addSurveyScan.mockReset().mockResolvedValue(undefined);
  startSurvey.mockReset().mockResolvedValue({ id: 'abc234', url: 'x', expiresAt: EXPIRES });
  resolvePayeeId.mockReset().mockResolvedValue({ ok: false });
  resolveTypedPayee.mockReset().mockResolvedValue({ ok: false });
  resolvePlaceId.mockReset().mockResolvedValue({ ok: false });
});
afterEach(cleanup);

describe('SurveyStartScreen', () => {
  it('fills the form from the link, and shows a link that matches it', () => {
    renderScreen('?place=Efa&payee=Bob&rate=10&notes=Bring%20a%20hauler');
    expect(screen.getByTestId('picker')).toHaveTextContent('Efa|no-login');
    expect(screen.getByLabelText('Moon tax payee')).toHaveValue('Bob');
    expect(screen.getByLabelText('Moon tax rate (%)')).toHaveValue('10');
    expect(screen.getByLabelText('Start link')).toHaveValue(
      `${window.location.origin}/survey?place=Efa&payee=Bob&rate=10&notes=Bring+a+hauler`
    );
    expect(screen.getByText('How to make a start link')).toBeTruthy();
  });

  it('puts an edit into the link', () => {
    renderScreen('');
    fireEvent.change(screen.getByLabelText('Moon tax payee'), { target: { value: 'Bob Corp' } });
    fireEvent.change(screen.getByLabelText('Moon tax rate (%)'), { target: { value: '12.5' } });
    expect(screen.getByLabelText('Start link')).toHaveValue(
      `${window.location.origin}/survey?payee=Bob+Corp&rate=12.5`
    );
  });

  it('names a payee ID with ESI’s answer and starts the survey under that name', async () => {
    resolvePayeeId.mockResolvedValue({
      ok: true,
      name: 'Bob Corporation',
      kind: 'corporation',
      id: 98000001,
    });
    renderScreen('?payeeId=98000001&rate=10');
    expect(await screen.findByText('Found: Bob Corporation (corporation)')).toBeTruthy();
    await pasteScan();
    await waitFor(() => expect(startSurvey).toHaveBeenCalled());
    expect(startSurvey).toHaveBeenCalledWith({
      owner: undefined,
      prefill: {
        location: null,
        tax: { name: 'Bob Corporation', pct: 10 },
        notes: '',
      },
    });
  });

  it('warns about an ID nothing has, and falls back to the typed name', async () => {
    renderScreen('?payee=Bob&payeeId=5&rate=10');
    expect(
      await screen.findByText(/No corporation, alliance or character has that ID/)
    ).toBeTruthy();
    await pasteScan();
    await waitFor(() => expect(startSurvey).toHaveBeenCalled());
    expect(startSurvey.mock.calls[0]![0].prefill.tax).toEqual({ name: 'Bob', pct: 10 });
  });

  it('checks a typed payee name with ESI, shows the in-game spelling, and puts its ID in the link', async () => {
    resolveTypedPayee.mockResolvedValue({
      ok: true,
      name: 'Bob Corporation',
      kind: 'corporation',
      id: 98000001,
    });
    renderScreen('');
    fireEvent.change(screen.getByLabelText('Moon tax payee'), {
      target: { value: 'bob corporation' },
    });
    fireEvent.change(screen.getByLabelText('Moon tax rate (%)'), { target: { value: '10' } });
    expect(await screen.findByText('Found: Bob Corporation (corporation)')).toBeTruthy();
    expect(screen.getByLabelText('Start link')).toHaveValue(
      `${window.location.origin}/survey?payeeId=98000001&rate=10`
    );
    await pasteScan();
    await waitFor(() => expect(startSurvey).toHaveBeenCalled());
    expect(startSurvey.mock.calls[0]![0].prefill.tax).toEqual({ name: 'Bob Corporation', pct: 10 });
  });

  it('says so when no corporation, alliance or pilot has the typed name, and keeps the name', async () => {
    renderScreen('');
    fireEvent.change(screen.getByLabelText('Moon tax payee'), { target: { value: 'Nobodyatall' } });
    expect(await screen.findByText(/has exactly that name/)).toBeTruthy();
  });

  it('names a place given by ID alone', async () => {
    resolvePlaceId.mockResolvedValue({ ok: true, name: 'Efa' });
    renderScreen('?placeId=30001');
    // The ID boxes stay folded away until asked for.
    expect(screen.queryByLabelText('Place ID')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add IDs instead' }));
    expect(await screen.findByText('Found: Efa')).toBeTruthy();
    await pasteScan();
    await waitFor(() => expect(startSurvey).toHaveBeenCalled());
    expect(startSurvey.mock.calls[0]![0].prefill.location).toEqual({ id: 30001, name: 'Efa' });
  });

  it('starts anonymously with the first scan, then opens its public page', async () => {
    renderScreen('?place=Efa&placeId=7');
    await pasteScan();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/s/abc234'));
    expect(addSurveyScan).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc234', text: SCAN, expiresAt: EXPIRES })
    );
  });

  it('starts it as the logged-in Character and opens it on their own Survey tab', async () => {
    await db.characters.put({ characterId: 7, name: 'Shawn Dibble', ownerHash: 'h', addedAt: 1 });
    useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
    renderScreen('');
    await pasteScan();
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/mining/survey?survey=abc234')
    );
    expect(startSurvey.mock.calls[0]![0].owner).toEqual({
      characterId: 7,
      ownerName: 'Shawn Dibble',
    });
  });

  it('starts the survey from a scan pasted into the box, and says so for text that is not one', async () => {
    renderScreen('');
    const box = screen.getByLabelText('Paste your scan');
    fireEvent.paste(box, { clipboardData: { getData: () => 'hello' } });
    expect(await screen.findByText(/isn.t a Survey Scanner copy/)).toBeTruthy();
    expect(startSurvey).not.toHaveBeenCalled();
    fireEvent.paste(box, { clipboardData: { getData: () => SCAN } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/s/abc234'));
  });

  it('starts nothing for a paste that is not a scan', async () => {
    renderScreen('');
    fireEvent.paste(document.body, { clipboardData: { getData: () => 'hello' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(startSurvey).not.toHaveBeenCalled();
  });
});

describe('SurveyStartScreen payee from an ID alone', () => {
  it('shows the name ESI gave the payee ID in the name box, keeping the ID', async () => {
    resolvePayeeId.mockResolvedValue({
      ok: true,
      name: 'Bureau of Unified Harvesting',
      kind: 'corporation',
      id: 98837836,
    });
    renderScreen('?payeeId=98837836&rate=5');
    await waitFor(() =>
      expect((screen.getByLabelText('Moon tax payee') as HTMLInputElement).value).toBe(
        'Bureau of Unified Harvesting'
      )
    );
  });
});
