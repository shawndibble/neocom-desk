import '@/i18n';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GlobalPasteRouter } from './GlobalPasteRouter';

vi.mock('@/features/market/appraisalData', () => ({
  loadAppraisalCatalogue: () =>
    Promise.resolve(
      new Map(
        ['Rifter', 'Damage Control II', 'Tritanium'].map((name, index) => [
          name.toLowerCase(),
          { typeId: index + 1, name },
        ])
      )
    ),
}));

vi.mock('@/features/fittings/hullNames', () => ({
  loadHullNames: () => Promise.resolve(new Set(['rifter'])),
}));

const FIT = '[Rifter, Kite]\n\nDamage Control II';

function Where() {
  const location = useLocation();
  return (
    <div data-testid="where">
      {location.pathname} {JSON.stringify(location.state)}
    </div>
  );
}

function renderRouter(extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <GlobalPasteRouter />
      {extra}
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

async function paste(target: Element, text: string) {
  await act(async () => {
    fireEvent.paste(target, { clipboardData: { getData: () => text } });
    // Lets the lazy imports and the catalogue promise settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('GlobalPasteRouter', () => {
  it('offers to open a pasted fit, and opens it in Fittings', async () => {
    renderRouter();
    await paste(document.body, FIT);
    fireEvent.click(await screen.findByRole('button', { name: 'Open in Fittings' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/ships/fittings');
    expect(screen.getByTestId('where')).toHaveTextContent('"fittingLoadText"');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers to appraise a pasted item list', async () => {
    renderRouter();
    await paste(document.body, 'Tritanium\t1,000\nDamage Control II\t2');
    fireEvent.click(await screen.findByRole('button', { name: 'Appraise' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/market/appraisal');
    expect(screen.getByTestId('where')).toHaveTextContent('"appraiseText"');
  });

  it('offers nothing for text that is neither', async () => {
    renderRouter();
    await paste(document.body, 'see you in local o7');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('leaves a paste into a field alone', async () => {
    renderRouter(<input aria-label="search" />);
    await paste(screen.getByLabelText('search'), FIT);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('leaves a paste alone while a dialog is open', async () => {
    renderRouter(<div role="dialog" />);
    await paste(document.body, FIT);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
