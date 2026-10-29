import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { stubViewport } from '@/test/viewport';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { seedCharacter as seedCharacterRow, seedGrant as seedGrantFor } from '@/test/seed';
import { configureEsi } from '@/esi/client';
import { useSkillComparisons } from '@/features/skills/comparisons';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SkillCompareDrawer } from './SkillCompareDrawer';
import type { SkillType } from '@/sde/types';
import { deferred } from '@/test/deferred';

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
  loadMarketWideTrees: vi.fn(async () => ({})),
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

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // `App` wires this at boot; an isolated render has to do it itself.
  configureEsi({ getToken: async () => 'access-token' });
});
afterAll(() => {
  server.close();
  configureEsi({ getToken: null });
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

async function seedCharacter(characterId: number, name: string) {
  await seedCharacterRow(characterId, name, { ownerHash: `oh-${characterId}` });
  await seedGrantFor(characterId, [], { expiresAt: Date.now() + 3_600_000 });
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useSkillComparisons.setState({ value: { items: [], updatedAt: 0 }, hydrated: false });
  await seedCharacter(CHAR_A, 'Pilot One');
  await seedCharacter(CHAR_B, 'Pilot Two');
});

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

/** The drawer on its own, in a router: the URL carries the selection, as it does on Skills › Trained. */
function renderDrawer(search = '', onClose: () => void = () => {}, activeCharacterId = CHAR_A) {
  return render(
    <MemoryRouter initialEntries={[`/skills/trained${search}`]}>
      <SkillCompareDrawer open onClose={onClose} activeCharacterId={activeCharacterId} />
      <LocationProbe />
    </MemoryRouter>
  );
}

function currentSearch(): URLSearchParams {
  return new URLSearchParams(screen.getByTestId('search').textContent ?? '');
}

/** A character chip in the picker, found by name. */
async function chip(name: RegExp): Promise<HTMLElement> {
  const list = await screen.findByRole('list', { name: 'Characters to compare' });
  return await within(list).findByRole('button', { name });
}

function skillRow(table: HTMLElement, name: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('rowheader')?.textContent === name);
  if (!row) throw new Error(`No row found for "${name}"`);
  return row;
}

function columnNames(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent ?? '')
    .filter((text) => text.startsWith('Pilot'));
}

describe('SkillCompareDrawer', () => {
  it('starts from the active character and shows each selected character as pips against the baseline', async () => {
    const user = userEvent.setup();
    renderDrawer();

    expect(await chip(/Pilot One/)).toHaveAttribute('aria-pressed', 'true');
    await user.click(await chip(/Pilot Two/));

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));

    const gunnery = within(skillRow(table, 'Gunnery')).getAllByRole('cell');
    // Pilot One (the baseline) is a bare level; Pilot Two is its level and the lead over it.
    expect(gunnery[0]).toHaveTextContent('3');
    expect(gunnery[0]).not.toHaveTextContent('+');
    expect(gunnery[1]).toHaveTextContent('5');
    expect(gunnery[1]).toHaveTextContent('+2');
    expect(within(gunnery[1]!).getByRole('img', { name: 'Level 5 of 5' })).toBeInTheDocument();

    // Pilot One has no Spaceship Command at all: level 0, and Pilot Two is ahead by its whole level.
    expect(within(skillRow(table, 'Spaceship Command')).getAllByRole('cell')[1]).toHaveTextContent(
      '+2'
    );
  });

  it('makes the active character the baseline even when it is not the first selected', async () => {
    renderDrawer(`?ids=${CHAR_B},${CHAR_A}`);

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));
  });

  it('gives a character whose skills could not be read no column, and says so', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_B}/skills`, () =>
        HttpResponse.json({ error: 'Character not found' }, { status: 404 })
      )
    );
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

    expect(await screen.findByText(/Couldn't load skills for Pilot Two/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Pilot Two/ })).not.toBeInTheDocument();
  });

  it('shows no deltas until the baseline has loaded', async () => {
    const held = deferred();
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_A}/skills`, async () => {
        await held.promise;
        return HttpResponse.json({
          skills: [{ skill_id: GUNNERY, trained_skill_level: 3, skillpoints_in_skill: 24_000 }],
          total_sp: 24_000,
          unallocated_sp: 0,
        });
      })
    );
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

    expect(await screen.findByRole('status', { name: 'Loading skills…' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Skill comparison' })).not.toBeInTheDocument();

    held.resolve();
    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));
  });

  it('forgets the selection from the URL when it closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}&baseline=${CHAR_B}`, onClose);

    await screen.findByRole('table', { name: 'Skill comparison' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''));
  });

  it('says missing, not a bare minus, for a skill the baseline has and the character lacks', async () => {
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}&baseline=${CHAR_B}`);

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    await waitFor(() => expect(columnNames(table)).toEqual(['Pilot TwoBaseline', 'Pilot One']));
    expect(within(skillRow(table, 'Spaceship Command')).getAllByRole('cell')[1]).toHaveTextContent(
      'missing'
    );
    expect(within(skillRow(table, 'Gunnery')).getAllByRole('cell')[1]).toHaveTextContent('−2');
  });

  it('sums each band: how far a character is ahead or behind the baseline across its skills', async () => {
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));
    const band = within(table)
      .getAllByRole('row')
      .find((row) => within(row).queryByRole('columnheader', { name: 'Gunnery' }));
    expect(band).toBeDefined();
    expect(within(band!).getAllByRole('cell')[1]).toHaveTextContent('+2');
  });

  it('holds back skills every character matches behind one count, and reveals them on demand', async () => {
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
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));
    expect(() => skillRow(table, 'Gunnery')).toThrow();
    expect(skillRow(table, 'Spaceship Command')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1 skill identical' }));
    expect(skillRow(table, 'Gunnery')).toBeInTheDocument();
  });

  it('lists everything once Differing only is switched off, and keeps that in the URL', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_B}/skills`, () =>
        HttpResponse.json({
          skills: [{ skill_id: GUNNERY, trained_skill_level: 3, skillpoints_in_skill: 24_000 }],
          total_sp: 24_000,
          unallocated_sp: 0,
        })
      )
    );
    const user = userEvent.setup();
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

    const chipButton = await screen.findByRole('button', { name: 'Differing only' });
    expect(chipButton).toHaveAttribute('aria-pressed', 'true');
    await user.click(chipButton);

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    expect(skillRow(table, 'Gunnery')).toBeInTheDocument();
    expect(currentSearch().get('differingOnly')).toBe('0');
  });

  it('prunes an unknown character id from a hand-edited URL instead of showing a ghost column', async () => {
    renderDrawer(`?ids=${CHAR_A},${CHAR_B},999999`);

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    expect(within(table).queryByText('#999999')).not.toBeInTheDocument();
    await waitFor(() => expect(currentSearch().get('ids')).toBe(`${CHAR_A},${CHAR_B}`));
  });

  it('saves the current selection, lists it, and reloads it after deselecting', async () => {
    const user = userEvent.setup();
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

    await user.click(await screen.findByRole('button', { name: 'Saved' }));
    await user.click(screen.getByRole('button', { name: 'Save comparison' }));

    expect(await screen.findByText('Untitled comparison')).toBeInTheDocument();
    const stored = (await db.settings.get('skillComparisons'))?.value as {
      items: { characterIds: number[] }[];
    };
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]?.characterIds.sort()).toEqual([CHAR_A, CHAR_B]);

    // Deselect both, then reload the saved comparison from the list.
    await user.keyboard('{Escape}');
    await user.click(await chip(/Pilot One/));
    await user.click(await chip(/Pilot Two/));
    expect(screen.getByText('No characters selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await user.click(screen.getByText('Untitled comparison'));
    await screen.findByRole('table', { name: 'Skill comparison' });
    expect(await chip(/Pilot One/)).toHaveAttribute('aria-pressed', 'true');
    expect(await chip(/Pilot Two/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('renames and deletes a saved comparison', async () => {
    const user = userEvent.setup();
    renderDrawer(`?ids=${CHAR_A}`);

    await user.click(await screen.findByRole('button', { name: 'Saved' }));
    await user.click(screen.getByRole('button', { name: 'Save comparison' }));
    expect(await screen.findByText('Untitled comparison')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename Untitled comparison' }));
    const input = screen.getByRole('textbox', { name: 'Rename' });
    await user.clear(input);
    await user.type(input, 'Miners{Enter}');
    expect(await screen.findByText('Miners')).toBeInTheDocument();
    // Enter unmounted the focused input: focus returns to the row's Rename button.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rename Miners' })).toHaveFocus()
    );

    const row = screen.getByText('Miners').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Delete Miners' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Miners')).not.toBeInTheDocument());
    expect(screen.getByText('No saved comparisons yet.')).toBeInTheDocument();
    // The only row is gone: focus lands on the menu heading, not <body>.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Saved comparisons' })).toHaveFocus()
    );
  });

  it('clicking Save again for the same selection updates the saved entry instead of duplicating it', async () => {
    const user = userEvent.setup();
    renderDrawer(`?ids=${CHAR_A}`);

    await user.click(await screen.findByRole('button', { name: 'Saved' }));
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

  it('degrades a saved comparison naming a since-removed character instead of breaking', async () => {
    await useSkillComparisons.getState().setValue({
      items: [{ id: 'gone', name: 'Old crew', characterIds: [CHAR_A, 999_999] }],
      updatedAt: 1,
    });
    const user = userEvent.setup();
    renderDrawer(`?ids=${CHAR_B}`);

    await user.click(await screen.findByRole('button', { name: 'Saved' }));
    await user.click(await screen.findByText('Old crew'));

    expect(
      await screen.findByText(
        'Some characters in this comparison have been removed and are no longer shown.',
        { selector: 'p' }
      )
    ).toBeInTheDocument();
    await waitFor(async () =>
      expect(await chip(/Pilot One/)).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('resolves a saved comparison clicked before the character roster has loaded', async () => {
    // The saved list renders straight from the comparisons store, so it is
    // clickable on the very first frame — before `db.characters`' useLiveQuery
    // has resolved. Resolving against an empty roster dropped every id and left
    // a permanent "some characters removed" notice with a selection of none
    // (#594).
    const readRoster = db.characters.toArray.bind(db.characters);
    vi.spyOn(db.characters, 'toArray').mockImplementation(() =>
      readRoster().then(async (rows) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return rows;
      })
    );
    await useSkillComparisons.getState().setValue({
      items: [{ id: 'both', name: 'Both pilots', characterIds: [CHAR_A, CHAR_B] }],
      updatedAt: 1,
    });
    const user = userEvent.setup();
    renderDrawer(`?ids=${CHAR_A}`);

    await user.click(await screen.findByRole('button', { name: 'Saved' }));
    await user.click(await screen.findByText('Both pilots'));

    const table = await screen.findByRole('table', { name: 'Skill comparison' });
    await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));
    expect(
      screen.queryByText(
        'Some characters in this comparison have been removed and are no longer shown.'
      )
    ).not.toBeInTheDocument();
  });

  it('shows an empty state instead of a bare table when nothing is cached for the selection', async () => {
    await seedCharacter(CHAR_C, 'Pilot Three');
    renderDrawer(`?ids=${CHAR_C}`);

    expect(await screen.findByText('No skill data cached')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Skill comparison' })).not.toBeInTheDocument();
  });

  it('asks for a second character when only the baseline is picked', async () => {
    renderDrawer(`?ids=${CHAR_A}`);

    expect(await screen.findByText('Pick someone to compare')).toBeInTheDocument();
  });

  it('draws one card per skill on a phone, with each character as a labelled line', async () => {
    stubViewport((query) => query.includes('max-width'));
    renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

    const dialog = await screen.findByRole('dialog', { name: 'Compare skills' });
    const card = (
      await within(dialog).findByText('Gunnery', { selector: 'a, button, span' })
    ).closest('li')!;
    expect(within(card).getByText('Pilot One')).toBeInTheDocument();
    expect(within(card).getByText('Pilot Two')).toBeInTheDocument();
    expect(within(card).getByText('+2')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Skill comparison' })).not.toBeInTheDocument();
  });

  describe('loading contract (DESIGN §6a)', () => {
    it('keeps the table while an added character loads, with no column until its skills land', async () => {
      await seedCharacter(CHAR_C, 'Pilot Three');
      const held = deferred();
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_C}/skills`, async () => {
          await held.promise;
          return HttpResponse.json({
            skills: [{ skill_id: GUNNERY, trained_skill_level: 1, skillpoints_in_skill: 250 }],
            total_sp: 250,
            unallocated_sp: 0,
          });
        })
      );
      const user = userEvent.setup();
      renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

      const table = await screen.findByRole('table', { name: 'Skill comparison' });
      await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));

      const pendingChip = await chip(/Pilot Three/);
      await user.click(pendingChip);

      expect(screen.getByRole('table', { name: 'Skill comparison' })).toBe(table);
      expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']);
      expect(within(pendingChip).getByRole('status')).toBeInTheDocument();

      held.resolve();
      await waitFor(() =>
        expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two', 'Pilot Three'])
      );
      expect(within(pendingChip).queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps the table and Refresh on screen while a refresh is in flight', async () => {
      const user = userEvent.setup();
      renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

      const table = await screen.findByRole('table', { name: 'Skill comparison' });
      await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));

      const held = deferred();
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_A}/skills`, async () => {
          await held.promise;
          return HttpResponse.json({
            skills: [{ skill_id: GUNNERY, trained_skill_level: 4, skillpoints_in_skill: 45_255 }],
            total_sp: 45_255,
            unallocated_sp: 0,
          });
        })
      );

      await user.click(screen.getByRole('button', { name: 'Refresh' }));

      expect(screen.getByRole('table', { name: 'Skill comparison' })).toBe(table);
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(within(skillRow(table, 'Gunnery')).getAllByRole('cell')[0]).toHaveTextContent('3');

      held.resolve();
      await waitFor(() =>
        expect(within(skillRow(table, 'Gunnery')).getAllByRole('cell')[0]).toHaveTextContent('4')
      );
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    });

    it('drops a deselected character column without a loading frame', async () => {
      const user = userEvent.setup();
      renderDrawer(`?ids=${CHAR_A},${CHAR_B}`);

      const table = await screen.findByRole('table', { name: 'Skill comparison' });
      await waitFor(() => expect(columnNames(table)).toEqual(['Pilot OneBaseline', 'Pilot Two']));

      await user.click(await chip(/Pilot Two/));

      expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
    });
  });
});
