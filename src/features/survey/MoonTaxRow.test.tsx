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
    fireEvent.click(screen.getByRole('button', { name: 'Manage Taxes' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/mining/tax'));
  });

  it('stays disabled until there is a name and a rate from 0 to 100, then creates the Payee', async () => {
    renderRow();
    const open = screen.getByRole('button', { name: 'Manage Taxes' });
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
});
