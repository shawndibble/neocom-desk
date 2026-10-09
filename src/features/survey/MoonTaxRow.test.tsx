import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { createPayee } from '@/features/miningTax/payees';
import { MoonTaxRow } from './MoonTaxRow';
import { useSurveyTax } from './surveyTaxPref';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderRow() {
  return render(
    <MemoryRouter initialEntries={['/mining/survey']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <MoonTaxRow characterId={7} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.payees.clear();
  await useSurveyTax.getState().setValue({ name: '', pct: '' });
});
afterEach(cleanup);

describe('MoonTaxRow', () => {
  it('fills in a known Payee’s rate from its name and offers the Payees to complete', async () => {
    await createPayee(7, { name: 'Moon Corp', defaultTaxPct: 8 });
    const { container } = renderRow();
    await waitFor(() => expect(container.querySelectorAll('datalist option')).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Who gets the tax'), { target: { value: 'moon corp' } });
    await waitFor(() =>
      expect((screen.getByLabelText('Tax rate, percent') as HTMLInputElement).value).toBe('8')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open in Mining Tax' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/mining/tax'));
  });

  it('stays disabled until there is a name and a rate from 0 to 100, then creates the Payee', async () => {
    renderRow();
    const open = screen.getByRole('button', { name: 'Open in Mining Tax' });
    expect((open as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Who gets the tax'), { target: { value: 'New Corp' } });
    fireEvent.change(screen.getByLabelText('Tax rate, percent'), { target: { value: '150' } });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(screen.getByLabelText('Tax rate, percent'), { target: { value: '12' } });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    await waitFor(async () => expect(await db.payees.count()).toBe(1));
    expect((await db.payees.toArray())[0]).toMatchObject({ name: 'New Corp', defaultTaxPct: 12 });
  });
});
