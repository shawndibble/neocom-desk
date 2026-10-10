import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { createPayee } from '@/features/miningTax/payees';
import { MoonTaxReadout, MoonTaxRow } from './MoonTaxRow';

const { setSurveyTax } = vi.hoisted(() => ({ setSurveyTax: vi.fn() }));
vi.mock('./surveyStore', () => ({ setSurveyTax }));

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

const SURVEY = { id: 'abc123XYZ', expiresAt: 5000, published: null };

function renderRow(survey?: Parameters<typeof MoonTaxRow>[0]['survey']) {
  return render(
    <MemoryRouter initialEntries={['/mining/survey']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <MoonTaxRow characterId={7} survey={survey} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

/** Opens the field behind the rate or the name, as a click on that text does. */
function edit(label: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

function type(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

beforeEach(async () => {
  await db.payees.clear();
  setSurveyTax.mockReset();
  setSurveyTax.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('MoonTaxRow', () => {
  it('reads as text until the name or rate is clicked, then edits both together', async () => {
    renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: /who gets the tax/i }).textContent).toBe('Moon Corp');
    edit(/tax rate/i);
    const rate = screen.getByLabelText('Tax rate, percent') as HTMLInputElement;
    expect(rate.value).toBe('8');
    expect((screen.getByLabelText('Who gets the tax') as HTMLInputElement).value).toBe('Moon Corp');
    fireEvent.change(rate, { target: { value: '12' } });
    fireEvent.keyDown(rate, { key: 'Enter' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: /tax rate/i }).textContent).toBe('12%');
  });

  it('keeps editing while focus moves between the two fields, and stops when it leaves them', async () => {
    renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } });
    edit(/who gets the tax/i);
    const name = screen.getByLabelText('Who gets the tax');
    const rate = screen.getByLabelText('Tax rate, percent');
    fireEvent.blur(name, { relatedTarget: rate });
    // The name input has a datalist, so it is a combobox, not a textbox.
    expect(screen.getByLabelText('Who gets the tax')).toBeTruthy();
    expect(screen.getByLabelText('Tax rate, percent')).toBeTruthy();
    fireEvent.blur(rate, { relatedTarget: document.body });
    expect(screen.queryByLabelText('Tax rate, percent')).toBeNull();
    expect(screen.queryByLabelText('Who gets the tax')).toBeNull();
  });

  it("fills in a known Payee's rate from its name and offers the Payees to complete", async () => {
    await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 8 });
    const { container } = renderRow();
    edit(/who gets the tax/i);
    await waitFor(() => expect(container.querySelectorAll('datalist option')).toHaveLength(1));
    type('Who gets the tax', 'moon corp');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /tax rate/i }).textContent).toBe('8%')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage Taxes' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/mining/tax'));
  });

  it('stays disabled until there is a name and a rate from 0 to 100, then creates the Payee', async () => {
    renderRow();
    const open = screen.getByRole('button', { name: 'Manage Taxes' });
    expect((open as HTMLButtonElement).disabled).toBe(true);
    edit(/who gets the tax/i);
    type('Who gets the tax', 'New Corp');
    edit(/tax rate/i);
    type('Tax rate, percent', '150');
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(true));
    edit(/tax rate/i);
    type('Tax rate, percent', '12');
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    await waitFor(async () => expect(await db.payees.count()).toBe(1));
    expect((await db.payees.toArray())[0]).toMatchObject({ name: 'New Corp', defaultTaxPct: 12 });
  });

  it('stores a complete name and rate on the survey once editing stops, and only then', async () => {
    renderRow(SURVEY);
    edit(/who gets the tax/i);
    type('Who gets the tax', 'Moon Corp');
    expect(setSurveyTax).not.toHaveBeenCalled();
    edit(/tax rate/i);
    fireEvent.change(screen.getByLabelText('Tax rate, percent'), { target: { value: '8' } });
    // Mid-edit: a half-typed rate is not sent.
    expect(setSurveyTax).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByLabelText('Tax rate, percent'));
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
    await screen.findByRole('button', { name: /tax rate/i });
    expect(setSurveyTax).not.toHaveBeenCalled();
  });
});

describe('MoonTaxRow blank start', () => {
  it('starts blank on a survey with no stored tax, whatever was set on another', async () => {
    const first = renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 8 } });
    expect(screen.getByRole('button', { name: /tax rate/i }).textContent).toBe('8%');
    first.unmount();
    renderRow(SURVEY);
    expect(screen.getByRole('button', { name: /tax rate/i }).textContent).not.toContain('8');
    expect(screen.getByRole('button', { name: /who gets the tax/i }).textContent).not.toContain(
      'Moon Corp'
    );
  });
});

describe('MoonTaxReadout', () => {
  it('shows the rate and who gets it, with a link to the Tax tab and nothing to edit', () => {
    render(
      <MemoryRouter>
        <MoonTaxReadout tax={{ name: 'Moon Corp', pct: 8 }} />
      </MemoryRouter>
    );
    expect(screen.getByText('8%')).toBeTruthy();
    expect(screen.getByText('Moon Corp').className).not.toContain('text-accent');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage Taxes' }).getAttribute('href')).toBe(
      '/mining/tax'
    );
  });

  it('names the buttons by their visible text when nothing is set', () => {
    renderRow(SURVEY);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '');
    expect(screen.getByRole('button', { name: /set rate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /set who gets the tax/i })).toBeTruthy();
    expect(names.some((name) => /: %$/.test(name))).toBe(false);
  });

  it('keeps the saved rate and payee in the button names', () => {
    renderRow({ ...SURVEY, published: { name: 'Moon Corp', pct: 10 } });
    expect(screen.getByRole('button', { name: /10%/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Moon Corp/ })).toBeTruthy();
  });

  it.each([['Enter'], ['Escape']])('returns focus to the rate button on %s', async (key) => {
    renderRow(SURVEY);
    edit(/set rate/i);
    const input = screen.getByLabelText('Tax rate, percent');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /tax rate/i }))
    );
  });

  it('returns focus to the payee button on Enter in the payee field', async () => {
    renderRow(SURVEY);
    edit(/set who gets the tax/i);
    fireEvent.keyDown(screen.getByLabelText('Who gets the tax'), { key: 'Enter' });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /who gets the tax/i }))
    );
  });
});
