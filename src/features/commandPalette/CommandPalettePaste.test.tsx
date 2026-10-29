import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { PasteDestination } from '@/engine/import/pasteDestination';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { DESTINATIONS } from '@/app/pasteRouting';
import { stubViewport } from '@/test/viewport';
import { CommandPaletteHost } from './CommandPaletteHost';
import { useCommandPalette } from './store';

// The data a paste is classified against; the real loaders fetch.
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
vi.mock('@/features/skills/typeCatalog', () => ({
  loadSkillNameMap: () => Promise.resolve(new Map([['gunnery', { typeID: 3300 }]])),
}));
vi.mock('@/features/industry/blueprintNames', () => ({
  loadBlueprintNames: () => Promise.resolve(new Set(['rifter blueprint', 'merlin blueprint'])),
}));
vi.mock('@/app/useGrantedScopes', () => ({
  useGrantedScopes: () => undefined,
  useLockedRoutes: () => new Set<string>(),
}));
vi.mock('@/features/corp/useCorpNavVisible', () => ({ useCorpNavVisible: () => false }));
vi.mock('@/features/corp/useCorpAccess', () => ({
  useCorpAccess: () => ({ state: 'none', capabilities: NO_CORP_CAPABILITIES }),
}));
vi.mock('@/sde/loadMarketSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadMarketSde')>()),
  loadLpCorporations: () => Promise.resolve([]),
}));
vi.mock('@/sde/loadSde', () => ({ loadShipTree: () => new Promise(() => {}) }));
vi.mock('@/app/loginFlow', () => ({ beginAddCharacterLogin: vi.fn() }));

const NL = String.fromCharCode(10);
const SAMPLES: Record<PasteDestination, string> = {
  survey: [
    'Pyroxeres\t8,016\t2,404 m3\t184,000.00 ISK\t33 km',
    'Veldspar\t1\t1 m3\t1 ISK\t1 km',
  ].join(NL),
  fitting: '[Rifter, Kite]\n\nDamage Control II',
  appraisal: 'Tritanium\t1,000\nDamage Control II\t2',
  skillPlan: 'Gunnery V\nGunnery IV',
  blueprintList: 'Rifter Blueprint\nMerlin Blueprint',
  pilotList: 'Alpha One\nBeta Two\nGamma Three',
  dscan: '626\tMy Vexor\tVexor\t1 km\n626\tB\tVexor\t2 km',
};

function Where() {
  const location = useLocation();
  return (
    <div data-testid="where">
      {location.pathname} {JSON.stringify(location.state)}
    </div>
  );
}

async function openPalette() {
  render(
    <MemoryRouter initialEntries={['/overview']}>
      <CommandPaletteHost />
      <Where />
    </MemoryRouter>
  );
  act(() => useCommandPalette.getState().show());
  return screen.findByRole('combobox');
}

async function paste(target: Element, text: string) {
  await act(async () => {
    fireEvent.paste(target, { clipboardData: { getData: () => text } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  stubViewport(() => false);
});

afterEach(() => {
  act(() => useCommandPalette.getState().hide());
  vi.restoreAllMocks();
});

describe('CommandPalette paste', () => {
  it.each(Object.keys(DESTINATIONS) as PasteDestination[])(
    'closes and opens the %s destination, as the global router would',
    async (destination) => {
      const input = await openPalette();
      const [path] = DESTINATIONS[destination](SAMPLES[destination], {
        pathname: '/overview',
        search: '',
      });
      await paste(input, SAMPLES[destination]);
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(path));
      expect(screen.getByTestId('where').textContent).toContain(
        JSON.stringify(
          DESTINATIONS[destination](SAMPLES[destination], { pathname: '/overview', search: '' })[1]
            .state
        )
      );
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    }
  );

  it('leaves a single line to the search', async () => {
    const input = await openPalette();
    await paste(input, 'Gunnery V');
    await act(async () => {});
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('keeps unrecognised multi-line text in the input, no navigation', async () => {
    const input = await openPalette();
    await paste(input, 'see you in local' + NL + 'o7 fly safe, everyone, see you later.');
    await act(async () => {});
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not navigate once the palette was closed while the paste classified', async () => {
    const input = await openPalette();
    act(() => {
      fireEvent.paste(input, { clipboardData: { getData: () => SAMPLES.fitting } });
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });
});
