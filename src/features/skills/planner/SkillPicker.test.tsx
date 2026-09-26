import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { SkillType } from '@/sde/types';
import type { TrainedSkill } from '@/engine/types';
import { buildUnlockIndex } from '@/engine/skillUnlocks';
import type { SkillCatalog } from '../skillMap';
import { SkillPicker } from './SkillPicker';

function skill(overrides: Partial<SkillType> & Pick<SkillType, 'typeID' | 'name'>): SkillType {
  return {
    description: '',
    groupID: 1,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
    ...overrides,
  };
}

const SKILLS: SkillType[] = [
  skill({ typeID: 1, name: 'Frigate', groupName: 'Spaceship Command' }),
  skill({ typeID: 2, name: 'Frigate Prefix Skill', groupName: 'Spaceship Command' }),
  skill({ typeID: 3, name: 'A Substring Frigate Skill', groupName: 'Spaceship Command' }),
  skill({ typeID: 4, name: 'Zzz Named Skill', groupName: 'Frigate' }),
];

/** The picker only reads the catalog to render prerequisites and unlocks. */
const CATALOG: SkillCatalog = (() => {
  const engineSkills = new Map(
    SKILLS.map((s) => [
      s.typeID,
      {
        typeID: s.typeID,
        name: s.name,
        rank: s.rank,
        primary: s.primaryAttr,
        secondary: s.secondaryAttr,
        prereqs: s.prereqs.map((p) => ({ typeID: p.skillTypeID, level: p.level })),
      },
    ])
  );
  return {
    engineSkills,
    bySkillTypeID: new Map(SKILLS.map((s) => [s.typeID, s])),
    unlocksByTypeID: buildUnlockIndex(engineSkills),
  };
})();

const NO_TRAINED: ReadonlyMap<number, TrainedSkill> = new Map();

/** Descriptions are the point of these: search reaches them as a secondary field. */
const DESCRIBED_SKILLS: SkillType[] = [
  skill({
    typeID: 11,
    name: 'Gunnery',
    description: 'Basic turret operation.',
    groupName: 'Gunnery',
  }),
  skill({
    typeID: 12,
    name: 'Spaceship Command',
    description: 'Improves turret tracking on all ships.',
    groupName: 'Spaceship Command',
  }),
  skill({
    typeID: 13,
    name: 'Mining',
    description: 'Extracts ore from asteroids.',
    groupName: 'Resource Processing',
  }),
];

describe('SkillPicker', () => {
  it('shows nothing until a query is typed', () => {
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('distinguishes an empty query from a query with no matches (#408)', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );
    expect(screen.queryByText(/no skills match/i)).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'zzzznomatch');

    expect(await screen.findByText(/no skills match "zzzznomatch"/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('ranks name matches exact > prefix > substring, with a group-name-only match last', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );

    await user.type(screen.getByRole('searchbox'), 'frigate');

    // The search re-rank is debounced (#408) — wait it out rather than
    // reading results synchronously right after typing.
    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Frigate'),
      expect.stringContaining('Frigate Prefix Skill'),
      expect.stringContaining('A Substring Frigate Skill'),
      expect.stringContaining('Zzz Named Skill'),
    ]);
  });

  it('still matches purely on groupName (no regression from the pre-rankedSearch OR-filter)', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );

    await user.type(screen.getByRole('searchbox'), 'spaceship command');

    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
  });

  it('calls onAdd with the picked skill and level, then clears the query', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={onAdd} />
    );

    const input = screen.getByRole('searchbox');
    await user.type(input, 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    if (!firstItem) throw new Error('expected at least one result');
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));
    await user.click(screen.getByRole('button', { name: 'Level III' }));

    expect(onAdd).toHaveBeenCalledWith({ skillTypeID: 1, targetLevel: 3 });
    expect(input).toHaveValue('');
  });

  it('returns focus to the search box and announces the pick once the level button unmounts', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );

    const input = screen.getByRole('searchbox');
    await user.type(input, 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    if (!firstItem) throw new Error('expected at least one result');
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));
    await user.click(screen.getByRole('button', { name: 'Level III' }));

    expect(input).toHaveFocus();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Added Frigate Level III')
    );
  });

  it('shows the pick confirmation visibly (not just to a screen reader) (#1704)', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );

    const input = screen.getByRole('searchbox');
    await user.type(input, 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    if (!firstItem) throw new Error('expected at least one result');
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));
    await user.click(screen.getByRole('button', { name: 'Level III' }));

    await waitFor(() => expect(screen.getByRole('status')).not.toHaveClass('sr-only'));
  });

  it('offers a jump-to-it link when the added row is off-screen, that scrolls it into view (#1704)', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    render(
      <>
        <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
        <div id="plan-entry-1-3" />
      </>
    );
    const row = document.getElementById('plan-entry-1-3');
    if (!row) throw new Error('expected the stand-in plan row to exist');
    row.getBoundingClientRect = () =>
      ({ top: 5000, bottom: 5050, left: 0, right: 0, width: 0, height: 50 }) as DOMRect;
    row.scrollIntoView = scrollIntoView;

    const input = screen.getByRole('searchbox');
    await user.type(input, 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    if (!firstItem) throw new Error('expected at least one result');
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));
    await user.click(screen.getByRole('button', { name: 'Level III' }));

    const jumpLink = await screen.findByRole('button', { name: /jump to it/i });
    await user.click(jumpLink);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('offers no jump-to-it link when the added row is already on-screen (#1704)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
        <div id="plan-entry-1-3" />
      </>
    );

    const input = screen.getByRole('searchbox');
    await user.type(input, 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    if (!firstItem) throw new Error('expected at least one result');
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));
    await user.click(screen.getByRole('button', { name: 'Level III' }));

    await waitFor(() => expect(screen.getByRole('status')).not.toHaveClass('sr-only'));
    expect(screen.queryByRole('button', { name: /jump to it/i })).not.toBeInTheDocument();
  });

  it('matches description text, not just name', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker
        skills={DESCRIBED_SKILLS}
        catalog={CATALOG}
        trainedSkills={NO_TRAINED}
        onAdd={vi.fn()}
      />
    );

    await user.type(screen.getByRole('searchbox'), 'tracking');

    const items = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('Spaceship Command');
  });

  it('ranks a name match above a description-only match', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker
        skills={DESCRIBED_SKILLS}
        catalog={CATALOG}
        trainedSkills={NO_TRAINED}
        onAdd={vi.fn()}
      />
    );

    await user.type(screen.getByRole('searchbox'), 'turret');

    const items = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
    expect(items[0]).toContain('Gunnery');
    expect(items[1]).toContain('Spaceship Command');
  });

  it('shows filter chips for the matched groups, toggle to narrow results', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker
        skills={DESCRIBED_SKILLS}
        catalog={CATALOG}
        trainedSkills={NO_TRAINED}
        onAdd={vi.fn()}
      />
    );

    await user.type(screen.getByRole('searchbox'), 'e');
    await screen.findAllByRole('listitem');
    const names = () => screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names().join()).toContain('Gunnery');
    expect(names().join()).toContain('Mining');

    const chip = screen.getByRole('button', { name: 'Resource Processing' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Mining');
  });

  it('narrows to a group crowded out of the unfiltered top results', async () => {
    const user = userEvent.setup();
    const common = Array.from({ length: 25 }, (_, i) =>
      skill({
        typeID: 100 + i,
        name: `Common Skill ${String(i).padStart(2, '0')}`,
        description: 'A widget-adjacent skill.',
        groupName: 'CommonGroup',
      })
    );
    const rare = skill({
      typeID: 999,
      name: 'Zzz Rare Skill',
      description: 'A widget-adjacent skill.',
      groupName: 'RareGroup',
    });

    render(
      <SkillPicker
        skills={[...common, rare]}
        catalog={CATALOG}
        trainedSkills={NO_TRAINED}
        onAdd={vi.fn()}
      />
    );

    await user.type(screen.getByRole('searchbox'), 'widget');
    await user.click(await screen.findByRole('button', { name: 'RareGroup' }));

    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Zzz Rare Skill');
  });
});

describe('SkillPicker level flags (#408)', () => {
  it('flags a level the character has already trained', async () => {
    const user = userEvent.setup();
    const trained: ReadonlyMap<number, TrainedSkill> = new Map([[1, { level: 3, sp: 0 }]]);
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={trained} onAdd={vi.fn()} />
    );

    await user.type(screen.getByRole('searchbox'), 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));

    // Accessible names concatenate with no separator ("Level IIIAlready
    // trained"), so a plain roman-numeral match must not also swallow a
    // longer numeral sharing its prefix ("Level II" is a prefix of "Level
    // III") — the negative lookahead rules out another roman-numeral letter
    // immediately following.
    const levelIII = screen.getByRole('button', { name: /^Level III(?![IVX])/ });
    expect(levelIII).toHaveTextContent(/already trained/i);
    const levelIV = screen.getByRole('button', { name: /^Level IV(?![IVX])/ });
    expect(levelIV).not.toHaveTextContent(/already trained/i);
  });

  it('flags a level already in the plan, distinctly from an already-trained level', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker
        skills={SKILLS}
        catalog={CATALOG}
        trainedSkills={NO_TRAINED}
        planEntries={[{ skillTypeID: 1, targetLevel: 2 }]}
        onAdd={vi.fn()}
      />
    );

    await user.type(screen.getByRole('searchbox'), 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));

    const levelII = screen.getByRole('button', { name: /^Level II(?![IVX])/ });
    expect(levelII).toHaveTextContent(/already in plan/i);
    expect(levelII).not.toHaveTextContent(/already trained/i);
    const levelIII = screen.getByRole('button', { name: /^Level III(?![IVX])/ });
    expect(levelIII).not.toHaveTextContent(/already in plan/i);
  });

  it('does not flag any level for a skill with neither training nor a plan entry', async () => {
    const user = userEvent.setup();
    render(
      <SkillPicker skills={SKILLS} catalog={CATALOG} trainedSkills={NO_TRAINED} onAdd={vi.fn()} />
    );

    await user.type(screen.getByRole('searchbox'), 'frigate');
    const firstItem = (await screen.findAllByRole('listitem'))[0];
    await user.click(within(firstItem).getByRole('button', { name: /^Frigate/ }));

    for (const level of ['I', 'II', 'III', 'IV', 'V']) {
      const button = screen.getByRole('button', { name: new RegExp(`Level ${level}$`) });
      expect(button).not.toHaveTextContent(/already/i);
    }
  });
});
