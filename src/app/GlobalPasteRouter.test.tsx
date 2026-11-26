import '@/i18n';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en.json';
import * as pasteDestinationModule from '@/engine/import/pasteDestination';
import { GlobalPasteRouter } from './GlobalPasteRouter';
import { routePaste } from './pasteRouting';

vi.mock('@/engine/import/pasteDestination', async (importOriginal) => {
  const actual = await importOriginal<typeof pasteDestinationModule>();
  return { ...actual, pasteDestination: vi.fn(actual.pasteDestination) };
});

vi.mock('./pasteRouting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pasteRouting')>();
  return { ...actual, routePaste: vi.fn(actual.routePaste) };
});

const market = vi.hoisted(() => ({ available: true, neverLoads: false }));

vi.mock('@/features/market/appraisalData', () => ({
  loadAppraisalCatalogue: () => {
    if (market.neverLoads) return new Promise(() => {});
    if (!market.available) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(
      new Map(
        ['Rifter', 'Damage Control II', 'Tritanium'].map((name, index) => [
          name.toLowerCase(),
          { typeId: index + 1, name },
        ])
      )
    );
  },
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

function paste(target: Element, text: string) {
  fireEvent.paste(target, { clipboardData: { getData: () => text } });
}

async function routed() {
  await waitFor(() => expect(routePaste).toHaveResolved());
}

describe('GlobalPasteRouter', () => {
  beforeEach(() => {
    vi.mocked(routePaste).mockClear();
  });
  afterEach(() => {
    market.neverLoads = false;
  });

  it('opens a pasted fit in Fittings', async () => {
    renderRouter();
    paste(document.body, FIT);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/ships/fittings'));
    expect(screen.getByTestId('where')).toHaveTextContent('"fittingLoadText"');
  });

  it('opens a pasted item list in the Appraisal', async () => {
    renderRouter();
    paste(document.body, 'Tritanium\t1,000\nDamage Control II\t2');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/market/appraisal'));
    expect(screen.getByTestId('where')).toHaveTextContent('"appraiseText"');
  });

  it('opens a survey scan without waiting on the market catalogue', async () => {
    market.neverLoads = true;
    renderRouter();
    paste(
      document.body,
      'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km\nClear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km'
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('survey'));
    expect(screen.getByTestId('where')).toHaveTextContent('"surveyScanText"');
  });

  it('opens a pasted skill plan in the Skills planner', async () => {
    renderRouter();
    paste(document.body, 'Gunnery V');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/skills/plans'));
    expect(screen.getByTestId('where')).toHaveTextContent('"skillPlanImportText"');
  });

  it('turns a pasted blueprint list into a Build Group on Industry', async () => {
    renderRouter();
    paste(document.body, ['Rifter Blueprint', 'Merlin Blueprint'].join(String.fromCharCode(10)));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/industry'));
    expect(screen.getByTestId('where')).toHaveTextContent('"blueprintListText"');
  });

  it('stays put for text that is neither', async () => {
    renderRouter();
    const classify = vi.mocked(pasteDestinationModule.pasteDestination);
    classify.mockClear();
    paste(document.body, 'see you in local o7');
    await waitFor(() => expect(classify).toHaveReturnedWith(null));
    await routed();
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });

  it('leaves a paste into a field alone', async () => {
    renderRouter(<input aria-label="search" />);
    const classify = vi.mocked(pasteDestinationModule.pasteDestination);
    classify.mockClear();
    paste(screen.getByLabelText('search'), FIT);
    expect(classify).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });

  it('still routes a paste while a dialog or sidebar is open', async () => {
    renderRouter(<div role="dialog" />);
    paste(document.body, FIT);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/fittings'));
  });

  it('still routes a paste when a field elsewhere kept focus', async () => {
    renderRouter(<input aria-label="search" />);
    screen.getByLabelText('search').focus();
    paste(document.body, FIT);
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
      paste(document.body, 'Gunnery V');
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/skills/plans'));
    });

    it('still opens a pasted fit', async () => {
      renderRouter();
      paste(document.body, FIT);
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/ships/fittings'));
    });

    it('still opens a pasted D-Scan in Pilot Lookup', async () => {
      renderRouter();
      paste(document.body, '626\tMy Vexor\tVexor\t1 km\n11379\t\tHyperion\t-');
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/travel/pilot'));
    });

    it('says so, instead of nothing, for an item list it cannot read', async () => {
      renderRouter();
      paste(document.body, 'Tritanium\t1,000\nDamage Control II\t2');
      expect(await screen.findByText(notice)).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('/overview');
    });

    it.each([
      ['bare names', 'Tritanium\nPyerite'],
      ['a multibuy', 'Tritanium x1000\nPyerite x200'],
    ])('does not send %s to Pilot Lookup; it says so', async (_name, text) => {
      renderRouter();
      paste(document.body, text);
      expect(await screen.findByText(notice)).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('/overview');
    });

    it('stays quiet for an ordinary paragraph', async () => {
      renderRouter();
      const classify = vi.mocked(pasteDestinationModule.pasteDestination);
      classify.mockClear();
      paste(
        document.body,
        'I was flying through Jita last night when a fleet showed up.\nThey were all in Tengus and it was a mess, honestly.'
      );
      await waitFor(() => expect(classify).toHaveBeenCalled());
      await routed();
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
    });

    it('stays quiet for a one-line paste that is nothing in particular', async () => {
      renderRouter();
      const classify = vi.mocked(pasteDestinationModule.pasteDestination);
      classify.mockClear();
      paste(document.body, 'see you in local o7');
      await waitFor(() => expect(classify).toHaveBeenCalled());
      await routed();
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
    });
  });

  it('does not show the notice for a multi-line paste that is simply not a known format, online', async () => {
    renderRouter();
    const classify = vi.mocked(pasteDestinationModule.pasteDestination);
    classify.mockClear();
    paste(document.body, 'https://example.com/a b c\nsee you in local o7!');
    await waitFor(() => expect(classify).toHaveReturnedWith(null));
    await routed();
    expect(screen.queryByText(en.shortcuts.pasteOffline)).not.toBeInTheDocument();
  });
});
