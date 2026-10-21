import '@/i18n';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en.json';
import * as pasteDestinationModule from '@/engine/import/pasteDestination';
import { GlobalPasteRouter } from './GlobalPasteRouter';

// Spied, so a "stays put" test can wait until the paste was really classified
// rather than asserting an absence before the lazy imports have settled.
vi.mock('@/engine/import/pasteDestination', async (importOriginal) => {
  const actual = await importOriginal<typeof pasteDestinationModule>();
  return { ...actual, pasteDestination: vi.fn(actual.pasteDestination) };
});

// The market catalogue is fetched on first use and not precached: `available`
// false is a fresh install with no connection.
const market = vi.hoisted(() => ({ available: true }));

vi.mock('@/features/market/appraisalData', () => ({
  loadAppraisalCatalogue: () =>
    !market.available
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(
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

vi.mock('@/features/skills/typeCatalog', () => ({
  loadSkillNameMap: () => Promise.resolve(new Map([['gunnery', { typeID: 3300 }]])),
}));

vi.mock('@/features/industry/blueprintNames', () => ({
  loadBlueprintNames: () => Promise.resolve(new Set(['rifter blueprint', 'merlin blueprint'])),
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

  it('opens a pasted skill plan in the Skills planner', async () => {
    renderRouter();
    await paste(document.body, 'Gunnery V');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/skills/plans'));
    expect(screen.getByTestId('where')).toHaveTextContent('"skillPlanImportText"');
  });

  it('turns a pasted blueprint list into a Build Group on Industry', async () => {
    renderRouter();
    await paste(
      document.body,
      ['Rifter Blueprint', 'Merlin Blueprint'].join(String.fromCharCode(10))
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/industry'));
    expect(screen.getByTestId('where')).toHaveTextContent('"blueprintListText"');
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
    const classify = vi.mocked(pasteDestinationModule.pasteDestination);
    classify.mockClear();
    await paste(screen.getByLabelText('search'), FIT);
    expect(classify).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });

  it('still routes a paste while a dialog or sidebar is open', async () => {
    renderRouter(<div role="dialog" />);
    await paste(document.body, FIT);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/fittings'));
  });

  it('still routes a paste when a field elsewhere kept focus', async () => {
    renderRouter(<input aria-label="search" />);
    screen.getByLabelText('search').focus();
    await paste(document.body, FIT);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/fittings'));
  });

  describe('without the market catalogue (offline, first visit)', () => {
    const notice = en.shortcuts.pasteOffline;
    beforeEach(() => {
      market.available = false;
    });
    afterEach(() => {
      market.available = true;
    });

    it('still opens a pasted skill plan', async () => {
      renderRouter();
      await paste(document.body, 'Gunnery V');
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/skills/plans'));
    });

    it('still opens a pasted fit', async () => {
      renderRouter();
      await paste(document.body, FIT);
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/ships/fittings'));
    });

    it('still opens a pasted D-Scan in Pilot Lookup', async () => {
      renderRouter();
      await paste(document.body, '626\tMy Vexor\tVexor\t1 km\n11379\t\tHyperion\t-');
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/travel/pilot'));
    });

    it('says so, instead of nothing, for an item list it cannot read', async () => {
      renderRouter();
      await paste(document.body, 'Tritanium\t1,000\nDamage Control II\t2');
      expect(await screen.findByText(notice)).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('/overview');
    });

    it.each([
      ['bare names', 'Tritanium\nPyerite'],
      ['a multibuy', 'Tritanium x1000\nPyerite x200'],
    ])('does not send %s to Pilot Lookup; it says so', async (_name, text) => {
      renderRouter();
      await paste(document.body, text);
      expect(await screen.findByText(notice)).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('/overview');
    });

    it('stays quiet for an ordinary paragraph', async () => {
      renderRouter();
      const classify = vi.mocked(pasteDestinationModule.pasteDestination);
      classify.mockClear();
      await paste(
        document.body,
        'I was flying through Jita last night when a fleet showed up.\nThey were all in Tengus and it was a mess, honestly.'
      );
      await waitFor(() => expect(classify).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
    });

    it('stays quiet for a one-line paste that is nothing in particular', async () => {
      renderRouter();
      const classify = vi.mocked(pasteDestinationModule.pasteDestination);
      classify.mockClear();
      await paste(document.body, 'see you in local o7');
      await waitFor(() => expect(classify).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
    });
  });

  it('does not show the notice for a multi-line paste that is simply not a known format, online', async () => {
    renderRouter();
    const classify = vi.mocked(pasteDestinationModule.pasteDestination);
    classify.mockClear();
    await paste(document.body, 'https://example.com/a b c\nsee you in local o7!');
    await waitFor(() => expect(classify).toHaveReturnedWith(null));
    expect(screen.queryByText(en.shortcuts.pasteOffline)).not.toBeInTheDocument();
  });
});
