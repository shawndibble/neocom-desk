import { describe, it, expect, vi } from 'vitest';
import type { NavDestination } from '@/app/navDestinations';
import {
  createCharactersProvider,
  createCommandsProvider,
  createPagesProvider,
  PALETTE_COMMANDS,
} from './providers';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

const signal = new AbortController().signal;

/** Every provider here is synchronous; the async contract is `usePaletteSearch`'s test. */
function searchSync(provider: PaletteProvider, query: string): readonly PaletteResult[] {
  const answer = provider.search(query, signal);
  if (!Array.isArray(answer)) throw new Error(`${provider.id} answered asynchronously`);
  return answer as readonly PaletteResult[];
}

function destination(overrides: Partial<NavDestination> & { path: string }): NavDestination {
  return {
    kind: 'page',
    pagePath: '/overview',
    labelKey: 'x',
    label: overrides.path,
    breadcrumb: overrides.path,
    locked: false,
    gating: 'scope',
    ...overrides,
  };
}

const DESTINATIONS: NavDestination[] = [
  destination({ path: '/overview', label: 'Overview', breadcrumb: 'Overview' }),
  destination({ path: '/industry', label: 'Industry', breadcrumb: 'Industry' }),
  destination({
    path: '/industry/opportunities',
    kind: 'tab',
    label: 'Opportunities',
    breadcrumb: 'Industry › Opportunities',
  }),
  destination({ path: '/assets', label: 'Assets', breadcrumb: 'Assets', locked: true }),
];

describe('createPagesProvider', () => {
  it('lists every page (not tab) for an empty query, so the palette doubles as a navigator', () => {
    const provider = createPagesProvider({ destinations: DESTINATIONS, navigate: vi.fn() });
    expect(searchSync(provider, '').map((r) => r.label)).toEqual([
      'Overview',
      'Industry',
      'Assets',
    ]);
  });

  it('finds a tab by its own name and labels it with the breadcrumb', () => {
    const navigate = vi.fn();
    const provider = createPagesProvider({ destinations: DESTINATIONS, navigate });
    const results = searchSync(provider, 'opp');
    expect(results.map((r) => r.label)).toEqual(['Industry › Opportunities']);
    results[0].run();
    expect(navigate).toHaveBeenCalledWith('/industry/opportunities');
  });

  it('matches a tab through its page name too', () => {
    const provider = createPagesProvider({ destinations: DESTINATIONS, navigate: vi.fn() });
    expect(searchSync(provider, 'industry').map((r) => r.label)).toEqual([
      'Industry',
      'Industry › Opportunities',
    ]);
  });

  it('marks a locked page but still navigates to it, so ScopeGate can explain', () => {
    const navigate = vi.fn();
    const provider = createPagesProvider({ destinations: DESTINATIONS, navigate });
    const [assets] = searchSync(provider, 'assets');
    expect(assets.locked).toBe(true);
    assets.run();
    expect(navigate).toHaveBeenCalledWith('/assets');
  });

  it('caps a searched group', () => {
    const many = Array.from({ length: GROUP_LIMIT + 5 }, (_, i) =>
      destination({ path: `/p${i}`, label: `Page ${i}`, breadcrumb: `Page ${i}` })
    );
    const provider = createPagesProvider({ destinations: many, navigate: vi.fn() });
    expect(searchSync(provider, 'page')).toHaveLength(GROUP_LIMIT);
  });
});

describe('createCommandsProvider', () => {
  const LABELS: Record<string, string> = {
    'commandPalette.commands.openSettings': 'Open settings',
    'commandPalette.commands.keyboardShortcuts': 'Keyboard shortcuts',
    'commandPalette.commands.addCharacter': 'Add character',
    'commandPalette.commands.notificationFeed': 'Open notification feed',
  };
  const t = (key: string) => LABELS[key] ?? key;

  it('is hidden until the pilot types', () => {
    const provider = createCommandsProvider({ t, navigate: vi.fn(), addCharacter: vi.fn() });
    expect(provider.minQueryLength).toBe(1);
  });

  it('runs each starter command against the right target', () => {
    const navigate = vi.fn();
    const addCharacter = vi.fn();
    const provider = createCommandsProvider({ t, navigate, addCharacter });
    const runFirst = (query: string) => searchSync(provider, query)[0].run();

    runFirst('settings');
    expect(navigate).toHaveBeenLastCalledWith('/settings');
    runFirst('keyboard');
    expect(navigate).toHaveBeenLastCalledWith('/settings/shortcuts');
    runFirst('notification');
    expect(navigate).toHaveBeenLastCalledWith('/alerts');
    runFirst('add char');
    expect(addCharacter).toHaveBeenCalledTimes(1);
  });

  it('declares every command once', () => {
    const ids = PALETTE_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('createCharactersProvider', () => {
  const characters = [
    { characterId: 1, name: 'Alpha Pilot' },
    { characterId: 2, name: 'Beta Pilot' },
  ];

  it('switches the active Character and marks the one already active', () => {
    const onSelect = vi.fn();
    const provider = createCharactersProvider({
      characters,
      activeCharacterId: 1,
      activeHint: 'Active',
      onSelect,
    });
    const results = searchSync(provider, 'pilot');
    expect(results.map((r) => [r.label, r.hint])).toEqual([
      ['Alpha Pilot', 'Active'],
      ['Beta Pilot', undefined],
    ]);
    results[1].run();
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('is hidden until the pilot types', () => {
    const provider = createCharactersProvider({
      characters,
      activeCharacterId: 1,
      activeHint: 'Active',
      onSelect: vi.fn(),
    });
    expect(provider.minQueryLength).toBe(1);
  });
});
