import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useSkillComparisons } from '@/features/skills/comparisons';
import { App } from '@/app/App';
import type { SkillType } from '@/sde/types';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// Real src/sync would attempt actual Firebase network calls. Not exercised by
// this route (no Editable Data of its own is synced), but App.tsx wires
// triggerSync globally on every character switch.
vi.mock('@/sync', () => ({
  markPlanDeleted: vi.fn(),
  scheduleSync: vi.fn(),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  subscribeSyncStatus: vi.fn((listener: (s: unknown) => void) => {
    listener({ state: 'idle', lastSyncedAt: null, error: null });
    return () => {};
  }),
}));

const GUNNERY = 1;
const SPACESHIP_COMMAND = 2;

const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: GUNNERY,
    name: 'Gunnery',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
  {
    typeID: SPACESHIP_COMMAND,
    name: 'Spaceship Command',
    description: '',
    groupID: 20,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'intelligence',
    secondaryAttr: 'memory',
    prereqs: [],
  },
];

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_A = 91;
const CHAR_B = 92;
const CHAR_C = 93;

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_A}/skills`, () =>
    HttpResponse.json({
      skills: [{ skill_id: GUNNERY, trained_skill_level: 3, skillpoints_in_skill: 24_000 }],
      total_sp: 24_000,
      unallocated_sp: 0,
    })
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_A}/skillqueue`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_B}/skills`, () =>
    HttpResponse.json({
      skills: [
        { skill_id: GUNNERY, trained_skill_level: 5, skillpoints_in_skill: 256_000 },
        { skill_id: SPACESHIP_COMMAND, trained_skill_level: 2, skillpoints_in_skill: 8000 },
      ],
      total_sp: 264_000,
      unallocated_sp: 0,
    })
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_B}/skillqueue`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_C}/skills`, () =>
    HttpResponse.json({ skills: [], total_sp: 0, unallocated_sp: 0 })
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_C}/skillqueue`, () => HttpResponse.json([]))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

async function seedCharacter(characterId: number, name: string) {
  await db.characters.put({ characterId, name, ownerHash: `oh-${characterId}`, addedAt: 1 });
  await db.tokens.put({
    characterId,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [],
  });
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useSkillComparisons.setState({ value: { items: [], updatedAt: 0 }, hydrated: false });

  await seedCharacter(CHAR_A, 'Pilot One');
  await seedCharacter(CHAR_B, 'Pilot Two');
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_A });

  window.history.pushState({}, '', '/skills/compare');
});

/**
 * The picker's own buttons, scoped away from the DataTable's sortable column
 * headers — a selected character's name appears as text in both places.
 */
async function picker(): Promise<HTMLElement> {
  const container = (await screen.findByText('Characters to compare'))
    .nextElementSibling as HTMLElement;
  // The character list populates from a useLiveQuery that resolves after the
  // initial render — wait for it rather than racing an empty <ul>.
  await within(container).findAllByRole('button');
  return container;
}

function rowByFirstCell(table: HTMLElement, text: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryAllByRole('cell')[0]?.textContent === text);
  if (!row) throw new Error(`No row found starting with "${text}"`);
  return row;
}

describe('SkillCompare', () => {
  it('shows each selected character trained levels side by side, gaps dimmed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await picker()).getByRole('button', { name: /Pilot One/ }));
    await user.click(within(await picker()).getByRole('button', { name: /Pilot Two/ }));

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    const gunneryRow = rowByFirstCell(table, 'Gunnery');
    const cells = within(gunneryRow).getAllByRole('cell');
    // skill, group, Pilot One (3), Pilot Two (5)
    expect(cells.map((cell) => cell.textContent)).toEqual(['Gunnery', 'Gunnery', '3', '5']);

    const trailingCell = cells[2];
    expect(trailingCell.className).toContain('text-text-dim');

    expect(rowByFirstCell(table, 'Spaceship Command')).toBeInTheDocument();
  });

  it('saves the current selection, lists it, and reloads it after deselecting', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await picker()).getByRole('button', { name: /Pilot One/ }));
    await user.click(within(await picker()).getByRole('button', { name: /Pilot Two/ }));
    await user.click(screen.getByRole('button', { name: 'Save comparison' }));

    expect(await screen.findByText('Untitled comparison')).toBeInTheDocument();
    const stored = (await db.settings.get('skillComparisons'))?.value as {
      items: { characterIds: number[] }[];
    };
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].characterIds.sort()).toEqual([CHAR_A, CHAR_B]);

    // Deselect both, then reload the saved comparison from the list.
    await user.click(within(await picker()).getByRole('button', { name: /Pilot One/ }));
    await user.click(within(await picker()).getByRole('button', { name: /Pilot Two/ }));
    expect(screen.getByText('No characters selected')).toBeInTheDocument();

    await user.click(screen.getByText('Untitled comparison'));
    await screen.findByRole('table', { name: 'Skill comparison' });
    expect(within(await picker()).getByRole('button', { name: /Pilot One/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(await picker()).getByRole('button', { name: /Pilot Two/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('renames and deletes a saved comparison', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await picker()).getByRole('button', { name: /Pilot One/ }));
    await user.click(screen.getByRole('button', { name: 'Save comparison' }));
    expect(await screen.findByText('Untitled comparison')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename Untitled comparison' }));
    const input = screen.getByRole('textbox', { name: 'Rename' });
    await user.clear(input);
    await user.type(input, 'Miners{Enter}');
    expect(await screen.findByText('Miners')).toBeInTheDocument();

    const row = screen.getByText('Miners').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Miners')).not.toBeInTheDocument());
    expect(screen.getByText('No saved comparisons yet.')).toBeInTheDocument();
  });

  it('degrades a saved comparison naming a since-removed character instead of breaking', async () => {
    await useSkillComparisons.getState().setValue({
      items: [{ id: 'gone', name: 'Old crew', characterIds: [CHAR_A, 999_999] }],
      updatedAt: 1,
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Old crew'));

    expect(
      await screen.findByText(
        'Some characters in this comparison have been removed and are no longer shown.'
      )
    ).toBeInTheDocument();
    expect(within(await picker()).getByRole('button', { name: /Pilot One/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await screen.findByRole('table', { name: 'Skill comparison' });
  });

  it('shows an empty state instead of a bare table when nothing is cached for the selection', async () => {
    await seedCharacter(CHAR_C, 'Pilot Three');
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await picker()).getByRole('button', { name: /Pilot Three/ }));

    expect(await screen.findByText('No skill data cached')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Skill comparison' })).not.toBeInTheDocument();
  });

  it('differing-only toggle hides rows where every compared character matches', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_B}/skills`, () =>
        HttpResponse.json({
          skills: [
            // Matches Pilot One's Gunnery level exactly.
            { skill_id: GUNNERY, trained_skill_level: 3, skillpoints_in_skill: 24_000 },
            { skill_id: SPACESHIP_COMMAND, trained_skill_level: 2, skillpoints_in_skill: 8000 },
          ],
          total_sp: 32_000,
          unallocated_sp: 0,
        })
      )
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await picker()).getByRole('button', { name: /Pilot One/ }));
    await user.click(within(await picker()).getByRole('button', { name: /Pilot Two/ }));

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    expect(rowByFirstCell(table, 'Gunnery')).toBeInTheDocument();
    expect(rowByFirstCell(table, 'Spaceship Command')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Differing only' }));

    expect(() => rowByFirstCell(table, 'Gunnery')).toThrow();
    expect(rowByFirstCell(table, 'Spaceship Command')).toBeInTheDocument();
  });

  it('group column toggle removes the group column from the table', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await picker()).getByRole('button', { name: /Pilot One/ }));

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    expect(within(table).getByRole('columnheader', { name: 'Group' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Group column' }));

    expect(within(table).queryByRole('columnheader', { name: 'Group' })).not.toBeInTheDocument();
  });

  it('clicking Save again for the same selection updates the saved entry instead of duplicating it', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(await picker()).getByRole('button', { name: /Pilot One/ }));
    await user.click(screen.getByRole('button', { name: 'Save comparison' }));
    expect(await screen.findByText('Untitled comparison')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save comparison' }));

    await waitFor(async () => {
      const stored = (await db.settings.get('skillComparisons'))?.value as {
        items: { id: string }[];
      };
      expect(stored.items).toHaveLength(1);
    });
    expect(screen.getAllByText('Untitled comparison')).toHaveLength(1);
  });
});
