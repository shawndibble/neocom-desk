import '@/i18n';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as pasteDestinationModule from '@/engine/import/pasteDestination';
import { GlobalPasteRouter } from './GlobalPasteRouter';

// Spied, so a "stays put" test can wait until the paste was really classified
// rather than asserting an absence before the lazy imports have settled.
vi.mock('@/engine/import/pasteDestination', async (importOriginal) => {
  const actual = await importOriginal<typeof pasteDestinationModule>();
  return { ...actual, pasteDestination: vi.fn(actual.pasteDestination) };
});

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
  it('opens a pasted fit in Fittings', async () => {
    renderRouter();
    await paste(document.body, FIT);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/ships/fittings'));
    expect(screen.getByTestId('where')).toHaveTextContent('"fittingLoadText"');
  });

  it('opens a pasted item list in the Appraisal', async () => {
    renderRouter();
    await paste(document.body, 'Tritanium\t1,000\nDamage Control II\t2');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/market/appraisal'));
    expect(screen.getByTestId('where')).toHaveTextContent('"appraiseText"');
  });

  it('stays put for text that is neither', async () => {
    renderRouter();
    const classify = vi.mocked(pasteDestinationModule.pasteDestination);
    classify.mockClear();
    await paste(document.body, 'see you in local o7');
    await waitFor(() => expect(classify).toHaveReturnedWith(null));
    await act(async () => {});
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });

  it('leaves a paste into a field alone', async () => {
    renderRouter(<input aria-label="search" />);
    await paste(screen.getByLabelText('search'), FIT);
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });

  it('leaves a paste alone while a dialog is open', async () => {
    renderRouter(<div role="dialog" />);
    await paste(document.body, FIT);
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });
});
