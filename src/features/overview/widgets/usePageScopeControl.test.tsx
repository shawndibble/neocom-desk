import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { corpWidgetBoard } from '@/features/corp/grid/corpGrid';
import type { CorpCapabilities } from '@/engine/corpRoles';
import '@/i18n';
import { beforeEach } from 'vitest';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { WidgetBoardContext } from './board';
import { registerKindDefs } from './data/models';
import { CORP_DEFS } from './data/corpModels';
import { OverviewEditProvider } from './OverviewEditProvider';
import { usePageScopeControl } from './usePageScopeControl';
import type { OverviewLayout, Widget } from './layout';

registerKindDefs(CORP_DEFS);

// Without an active Character the picker reads This character as All.
beforeEach(() => useActiveCharacter.setState({ activeCharacterId: 1 }));

const characters = vi.hoisted(() => ({ value: [{ characterId: 1 }, { characterId: 2 }] }));
vi.mock('@/features/character/useCharacters', () => ({
  useCharacters: () => characters.value,
}));
const corporations = vi.hoisted(() => ({
  value: [] as { id: number; label: { ticker: string; name: string } }[],
}));
vi.mock('@/features/corp/accountCorporations', () => ({
  useAccountCorporations: () => corporations.value,
}));

const widget = (id: string, kind: string, scope: Widget['scope']): Widget => ({
  id,
  kind,
  size: 'M',
  view: 'number',
  scope,
  showOnPhone: true,
});

function Picker() {
  const props = usePageScopeControl();
  return props ? <CharacterFilterControl {...props} /> : <span>no picker</span>;
}

function setup(
  widgets: Widget[],
  board?: Parameters<typeof WidgetBoardContext.Provider>[0]['value']
) {
  const onLayoutChange = vi.fn<(layout: OverviewLayout) => void>();
  const tree = (
    <OverviewEditProvider layout={{ version: 1, widgets }} onLayoutChange={onLayoutChange}>
      <Picker />
    </OverviewEditProvider>
  );
  render(
    board ? <WidgetBoardContext.Provider value={board}>{tree}</WidgetBoardContext.Provider> : tree
  );
  return onLayoutChange;
}

describe('the page scope control on the Overview', () => {
  it('reads the scope the widgets share and writes a choice onto every widget that can take it', async () => {
    // `orders` sums across Characters; `training` does not.
    const onLayoutChange = setup([
      widget('a', 'orders', 'header'),
      widget('b', 'training', 'header'),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'This character' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /^All characters/ }));
    expect(onLayoutChange.mock.calls[0]![0].widgets.map((w) => w.scope)).toEqual(['all', 'header']);
  });

  it('says Mixed, with no option checked, when widgets that can sum differ', async () => {
    setup([widget('a', 'orders', 'all'), widget('b', 'orders', 'header')]);
    const trigger = screen.getByRole('button', { name: /^Mixed/ });
    await userEvent.click(trigger);
    for (const option of screen.getAllByRole('menuitemradio')) {
      expect(option).not.toBeChecked();
    }
  });

  it('is absent with one Character: nothing to choose between', () => {
    characters.value = [{ characterId: 1 }];
    setup([widget('a', 'orders', 'header')]);
    expect(screen.getByText('no picker')).toBeInTheDocument();
    characters.value = [{ characterId: 1 }, { characterId: 2 }];
  });
});

describe('the page scope control on the Corp Board', () => {
  const CAPS = new Proxy({} as CorpCapabilities, { get: () => true });
  const board = corpWidgetBoard(CAPS, () => 2);
  const names = [
    { id: 98000001, label: { ticker: 'ACT', name: 'Amarr Control Tech' } },
    { id: 98000002, label: { ticker: 'ACME', name: 'Acme Mining Co' } },
  ];

  it('lists each corporation by name and writes the chosen one onto the widgets', async () => {
    corporations.value = names;
    const onLayoutChange = setup(
      [widget('a', 'corpJobs', 'all'), widget('b', 'corpMembers', 'header')],
      board
    );
    await userEvent.click(screen.getByRole('button', { name: /^All characters/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Acme Mining Co' }));
    expect(onLayoutChange.mock.calls[0]![0].widgets.map((w) => w.scope)).toEqual([
      'corp:98000002',
      'corp:98000002',
    ]);
  });

  it('shows the corporation the widgets share', () => {
    corporations.value = names;
    setup([widget('a', 'corpJobs', 'corp:98000002')], board);
    expect(screen.getByRole('button', { name: 'Acme Mining Co' })).toBeInTheDocument();
  });

  it('is absent with fewer than two corporations', () => {
    corporations.value = names.slice(0, 1);
    setup([widget('a', 'corpJobs', 'header')], board);
    expect(screen.getByText('no picker')).toBeInTheDocument();
  });
});
