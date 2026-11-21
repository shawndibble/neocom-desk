import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { BookSettingsDialog } from './BookSettingsDialog';
import { OWNER, REFINERY_B, bookSettingsValue } from './bookSettingsFixture';

const editBook = vi.fn();
vi.mock('../taxBook/bookClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../taxBook/bookClient')>()),
  editBook: (...a: unknown[]) => editBook(...a),
}));

const loadDivisions = vi.fn();
vi.mock('../wallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../wallet')>()),
  loadCorporationDivisions: (...a: unknown[]) => loadDivisions(...a),
}));

const mailingLists = vi.fn();
vi.mock('@/features/character/mail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/mail')>()),
  loadMailingLists: (...a: unknown[]) => mailingLists(...a),
}));
vi.mock('@/features/corp/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/members')>()),
  loadCorporationCeoId: () => Promise.resolve(31),
}));
vi.mock('@/features/character/names', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/names')>()),
  resolveNames: (ids: number[]) =>
    Promise.resolve(new Map(ids.map((id) => [id, id === 31 ? 'Varro Halden' : `Name ${id}`]))),
}));

beforeEach(() => {
  mailingLists.mockReset();
  mailingLists.mockResolvedValue({
    cached: { data: [{ mailing_list_id: 77, name: 'Tax desk' }] },
  });
  editBook.mockReset();
  editBook.mockResolvedValue({});
  loadDivisions.mockReset();
  loadDivisions.mockResolvedValue({ cached: null, needsReauth: false });
});

const renderDialog = () =>
  render(
    <MemoryRouter>
      <BookProvider value={bookSettingsValue()}>
        <BookSettingsDialog open onClose={() => {}} />
      </BookProvider>
    </MemoryRouter>
  );

describe('BookSettingsDialog per-refinery rate (#4621)', () => {
  it('lists a refinery rate by the refinery name', () => {
    renderDialog();
    const row = screen.getByText('Efa - Ashfall Tatara').closest('li')!;
    expect(within(row).getByText('Refinery')).toBeInTheDocument();
  });

  it('adds a rate for a moon owner refinery, which has no moon', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Applies to' }));
    await user.click(screen.getByRole('option', { name: 'Refinery' }));
    await user.click(screen.getByRole('combobox', { name: 'Refinery' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Efa - Ashfall Tatara', 'Efa - Ashfall Athanor']);
    await user.click(screen.getByRole('option', { name: 'Efa - Ashfall Athanor' }));
    await user.type(screen.getByLabelText('Rate (%)'), '4');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(7, 98000000, {
      action: 'addRate',
      rate: expect.objectContaining({ scope: 'structure', structureId: REFINERY_B, pct: 4 }),
    });
  });
});

describe('BookSettingsDialog per-moon-owner rate', () => {
  it('lists a moon owner rate by the corporation name', () => {
    renderDialog();
    const row = screen.getByText(`Corp ${OWNER}`).closest('li')!;
    expect(within(row).getByText('Moon owner')).toBeInTheDocument();
  });

  it('adds a rate for every refinery of a moon owner still in the book', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Applies to' }));
    await user.click(screen.getByRole('option', { name: 'Moon owner' }));
    await user.click(screen.getByRole('combobox', { name: 'Moon owner' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([`Corp ${OWNER}`]);
    await user.click(screen.getByRole('option', { name: `Corp ${OWNER}` }));
    await user.type(screen.getByLabelText('Rate (%)'), '9');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(7, 98000000, {
      action: 'addRate',
      rate: expect.objectContaining({ scope: 'feeder', feederId: OWNER, pct: 9 }),
    });
  });
});

describe('BookSettingsDialog pending rates (#6323)', () => {
  const addGuest = async (user: ReturnType<typeof userEvent.setup>, pct: string) => {
    await user.type(screen.getByLabelText('Rate (%)'), pct);
    await user.click(screen.getByRole('button', { name: 'Add rate' }));
  };

  it('adds three, removes one, and Save sends the other two as one batch', async () => {
    const user = userEvent.setup();
    renderDialog();
    for (const [pct, day] of [
      ['1', '2099-01-01'],
      ['2', '2099-01-02'],
      ['3', '2099-01-03'],
    ]) {
      fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: day } });
      await addGuest(user, pct);
    }
    expect(screen.getByText('Pending rates (3)')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Remove pending rate/ })[1]);
    expect(editBook).not.toHaveBeenCalled();
    expect(screen.getByText('Pending rates (2)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(7, 98000000, {
      action: 'addRates',
      rates: [
        expect.objectContaining({ pct: 1, effectiveFrom: '2099-01-01' }),
        expect.objectContaining({ pct: 3, effectiveFrom: '2099-01-03' }),
      ],
    });
  });

  it('keeps the scope and clears the percent after Add rate', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Applies to' }));
    await user.click(screen.getByRole('option', { name: 'Moon owner' }));
    await user.click(screen.getByRole('combobox', { name: 'Moon owner' }));
    await user.click(screen.getByRole('option', { name: `Corp ${OWNER}` }));
    await addGuest(user, '9');
    expect(screen.getByLabelText('Rate (%)')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Applies to' })).toHaveTextContent('Moon owner');
  });

  it('marks a duplicate and will not add it', async () => {
    const user = userEvent.setup();
    renderDialog();
    await addGuest(user, '1');
    await user.type(screen.getByLabelText('Rate (%)'), '2');
    expect(screen.getByRole('button', { name: 'Add rate' })).toBeDisabled();
    expect(
      screen.getByText('Another pending rate has the same type, target and day.')
    ).toBeInTheDocument();
  });

  it('asks before closing with pending rates', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <BookProvider value={bookSettingsValue()}>
          <BookSettingsDialog open onClose={onClose} />
        </BookProvider>
      </MemoryRouter>
    );
    await addGuest(user, '1');
    await user.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('1 pending rate is not saved. Discard it?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BookSettingsDialog tabs', () => {
  it('opens on Rates and shows one tab of settings at a time', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole('tab', { name: /Rates/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Trade hub')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    expect(screen.getByText('Trade hub')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rate (%)')).not.toBeInTheDocument();
  });

  it('keeps an edit made on one tab when another tab is opened', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    const grace = screen.getByRole('textbox', { name: 'Grace after day end (hours)' });
    await user.clear(grace);
    await user.type(grace, '12');
    await user.click(screen.getByRole('tab', { name: 'Extractions' }));
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    expect(screen.getByRole('textbox', { name: 'Grace after day end (hours)' })).toHaveValue('12');
  });

  it('takes a decimal grace: 0.5 hours (and 0,5) save as 0.5', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    const grace = screen.getByRole('textbox', { name: 'Grace after day end (hours)' });
    await user.clear(grace);
    await user.type(grace, '0,5');
    expect(grace).toHaveValue('0,5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(
      7,
      98000000,
      expect.objectContaining({
        action: 'updateSettings',
        patch: expect.objectContaining({ graceHours: 0.5 }),
      })
    );
  });

  it('has one save model: Save commits a filled rate and the settings, then reports it', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <MemoryRouter>
        <BookProvider value={bookSettingsValue()}>
          <BookSettingsDialog open onClose={() => {}} onSaved={onSaved} />
        </BookProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText(/with the reason/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Rate (%)'), '12');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook.mock.calls.map((c) => (c[2] as { action: string }).action)).toEqual([
      'addRate',
      'updateSettings',
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it('moves the start date through Save, and names wallet divisions or falls back to numbers', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BookProvider value={bookSettingsValue({ isDirector: true })}>
          <BookSettingsDialog open onClose={() => {}} />
        </BookProvider>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    expect(screen.getByRole('checkbox', { name: 'Division 1' })).toBeInTheDocument();
    const start = screen.getByLabelText('Start date (EVE time)');
    fireEvent.change(start, { target: { value: '2026-09-20' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(
      7,
      98000000,
      expect.objectContaining({
        action: 'updateSettings',
        patch: expect.objectContaining({ startDate: '2026-09-20' }),
      })
    );
  });

  it('leaves unchanged divisions and their names out of a save, so it never overwrites them', async () => {
    loadDivisions.mockResolvedValue({
      cached: { data: { wallet: [{ division: 1, name: 'Renamed' }] } },
      needsReauth: false,
    });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const call = editBook.mock.calls.find(
      (c) => (c[2] as { action: string }).action === 'updateSettings'
    );
    const patch = (call?.[2] as { patch: Record<string, unknown> }).patch;
    expect(patch).not.toHaveProperty('divisions');
    expect(patch).not.toHaveProperty('divisionsBase');
    expect(patch).not.toHaveProperty('divisionNames');
  });

  it('says another officer changed the divisions when the server refuses the save', async () => {
    editBook.mockRejectedValueOnce(
      Object.assign(new Error('changed'), { details: { reason: 'divisions-changed' } })
    );
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    await user.click(screen.getByRole('checkbox', { name: 'Division 2' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Another officer changed the divisions/)).toBeInTheDocument();
  });

  it("saves the corp's names for the divisions it reads, so members see them at once", async () => {
    loadDivisions.mockResolvedValue({
      cached: { data: { wallet: [{ division: 2, name: 'Market Funds' }] } },
      needsReauth: false,
    });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Division 2, Market Funds' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(
      7,
      98000000,
      expect.objectContaining({
        action: 'updateSettings',
        patch: expect.objectContaining({
          divisions: [1, 2],
          divisionsBase: [1],
          divisionNames: { 2: 'Market Funds' },
        }),
      })
    );
  });

  it('leaves the stored names alone when the names could not be read', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Billing' }));
    await user.click(screen.getByRole('checkbox', { name: 'Division 2' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const call = editBook.mock.calls.find(
      (c) => (c[2] as { action: string }).action === 'updateSettings'
    );
    expect((call?.[2] as { patch: object }).patch).not.toHaveProperty('divisionNames');
  });

  it('opens on Access and sync when it reopens after the EVE opt-in', () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/', state: { corpSyncGrant: { status: 'on' } } }]}
      >
        <BookProvider value={bookSettingsValue()}>
          <BookSettingsDialog open onClose={() => {}} />
        </BookProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('tab', { name: 'Access' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('BookSettingsDialog who answers tax questions', () => {
  it('defaults to the CEO, named, and saves nothing for it', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Access' }));
    expect(await screen.findByText('The CEO, Varro Halden')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const patch = editBook.mock.calls[0][2].patch as Record<string, unknown>;
    expect(patch).not.toHaveProperty('taxContact');
  });

  it("saves one of the officer's own mailing lists with its name", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Access' }));
    await screen.findByText('The CEO, Varro Halden');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Mailing list' }),
      await screen.findByRole('option', { name: 'Tax desk' })
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(
      7,
      98000000,
      expect.objectContaining({
        action: 'updateSettings',
        patch: expect.objectContaining({
          taxContact: { kind: 'mailingList', id: 77, name: 'Tax desk' },
        }),
      })
    );
  });
});

describe('BookSettingsDialog running account and late notices (#6294)', () => {
  const renderWith = (...args: Parameters<typeof bookSettingsValue>) =>
    render(
      <MemoryRouter>
        <BookProvider value={bookSettingsValue(...args)}>
          <BookSettingsDialog open onClose={() => {}} initialTab="billing" />
        </BookProvider>
      </MemoryRouter>
    );

  it('says every book is a running account, with no switch to offer', () => {
    renderWith({ isDirector: true });
    expect(screen.getByText(/Each day is owed as it closes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /running account/i })).not.toBeInTheDocument();
  });

  it('saves the notice rules and the day tolerance only when they change', async () => {
    const user = userEvent.setup();
    renderWith();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const untouched = editBook.mock.calls[0][2] as { patch: Record<string, unknown> };
    expect(untouched.patch).not.toHaveProperty('noticeRules');
    expect(untouched.patch).not.toHaveProperty('dayTolerancePct');

    editBook.mockClear();
    await user.click(screen.getByRole('button', { name: 'Day of month' }));
    const day = screen.getByRole('textbox', { name: 'Day of the month (1-28)' });
    await user.clear(day);
    await user.type(day, '5');
    const cooldown = screen.getByRole('textbox', { name: 'Days between notices' });
    await user.clear(cooldown);
    await user.type(cooldown, '10');
    const tolerance = screen.getByRole('textbox', { name: 'Day tolerance (%)' });
    await user.clear(tolerance);
    await user.type(tolerance, '1,5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(editBook).toHaveBeenCalledWith(
      7,
      98000000,
      expect.objectContaining({
        action: 'updateSettings',
        patch: expect.objectContaining({
          noticeRules: {
            after: { kind: 'dayOfMonth', day: 5 },
            minimum: 10_000_000,
            cooldownDays: 10,
          },
          dayTolerancePct: 1.5,
        }),
      })
    );
  });
});
