import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel, SkillBar, StatChip, StatChips, TypeIcon } from '@/components/ui';
import { SearchInput } from '@/components/ui/SearchInput';
import { Caret } from '@/components/ui/Disclosure';
import { NewComponent } from './NewComponent';

/**
 * Skills › Trained as a board: one tile per skill group (icon, bar, trained of
 * total), a group view with pips per skill, a queued colour, a "Need book"
 * marker, and one search box that also finds untrained skills.
 *
 * A tile expands its group in place; searching expands every matching group.
 *
 * New components in this mockup: `GroupTile` (dashed, labelled), `GroupSkillRow` and `NeedBookMarker` (the amber "Need book" chip, undashed so it stays readable).
 * Pips are the existing `SkillBar` (`plannedLevel` = queued). Skill names are
 * `SkillLink`s (open the skill info modal); the row click keeps the inspector.
 */

type Skill = {
  id: number;
  name: string;
  rank: number;
  level: number; // trained; -1 = no skill book
  queued?: number; // highest queued level
  progress?: number;
};
type Group = { name: string; iconTypeId: number; skills: Skill[] };

const GROUPS: Group[] = [
  {
    name: 'Spaceship Command',
    iconTypeId: 3327,
    skills: [
      { id: 3327, name: 'Spaceship Command', rank: 1, level: 5 },
      { id: 3330, name: 'Caldari Frigate', rank: 1, level: 5 },
      { id: 3331, name: 'Caldari Cruiser', rank: 5, level: 4, queued: 5, progress: 0.4 },
      { id: 3333, name: 'Caldari Battleship', rank: 8, level: 3 },
      { id: 3334, name: 'Gallente Frigate', rank: 1, level: 4 },
      { id: 3335, name: 'Gallente Cruiser', rank: 5, level: 2 },
      { id: 3336, name: 'Minmatar Frigate', rank: 1, level: 0 },
      { id: 3337, name: 'Amarr Frigate', rank: 1, level: -1 },
      { id: 3338, name: 'Amarr Cruiser', rank: 5, level: -1 },
      { id: 3339, name: 'Amarr Battleship', rank: 8, level: -1 },
    ],
  },
  {
    name: 'Gunnery',
    iconTypeId: 3300,
    skills: [
      { id: 3300, name: 'Gunnery', rank: 1, level: 5 },
      { id: 3301, name: 'Small Hybrid Turret', rank: 1, level: 5 },
      { id: 3302, name: 'Medium Hybrid Turret', rank: 3, level: 4, queued: 5 },
      { id: 3303, name: 'Large Hybrid Turret', rank: 5, level: 2 },
      { id: 3304, name: 'Small Projectile Turret', rank: 1, level: 3 },
      { id: 3305, name: 'Sharpshooter', rank: 2, level: -1 },
    ],
  },
  {
    name: 'Shields',
    iconTypeId: 3416,
    skills: [
      { id: 3416, name: 'Shield Management', rank: 3, level: 5 },
      { id: 3417, name: 'Shield Operation', rank: 1, level: 5 },
      { id: 3418, name: 'Shield Upgrades', rank: 2, level: 4 },
      { id: 3419, name: 'Tactical Shield Manipulation', rank: 2, level: 3 },
    ],
  },
  {
    name: 'Armor',
    iconTypeId: 3392,
    skills: [
      { id: 3392, name: 'Mechanics', rank: 1, level: 5 },
      { id: 3393, name: 'Repair Systems', rank: 1, level: 4 },
      { id: 3394, name: 'Hull Upgrades', rank: 2, level: 1 },
      { id: 3395, name: 'Armor Layering', rank: 2, level: -1 },
    ],
  },
  {
    name: 'Drones',
    iconTypeId: 3436,
    skills: [
      { id: 3436, name: 'Drones', rank: 1, level: 5 },
      { id: 3437, name: 'Drone Interfacing', rank: 5, level: 3, queued: 4 },
      { id: 3438, name: 'Advanced Drone Interfacing', rank: 5, level: -1 },
    ],
  },
  {
    name: 'Trade',
    iconTypeId: 3443,
    skills: [
      { id: 3443, name: 'Trade', rank: 1, level: 5 },
      { id: 3444, name: 'Broker Relations', rank: 1, level: 4 },
      { id: 3445, name: 'Accounting', rank: 1, level: 5 },
      { id: 3446, name: 'Margin Trading', rank: 6, level: -1 },
    ],
  },
  {
    name: 'Industry',
    iconTypeId: 3380,
    skills: [
      { id: 3380, name: 'Industry', rank: 1, level: 5 },
      { id: 3387, name: 'Mass Production', rank: 3, level: 4 },
      { id: 3388, name: 'Advanced Industry', rank: 1, level: 4 },
      { id: 3389, name: 'Reactions', rank: 1, level: 2 },
      { id: 3390, name: 'Supply Chain Management', rank: 3, level: -1 },
    ],
  },
];

const trainedCount = (g: Group) => g.skills.filter((s) => s.level >= 0).length;
const queuedCount = (g: Group) => g.skills.filter((s) => s.queued).length;

function useBoard() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      GROUPS.map((g) => ({
        group: g,
        skills: q ? g.skills.filter((s) => s.name.toLowerCase().includes(q)) : g.skills,
      })).filter((m) => !q || m.skills.length > 0),
    [q]
  );
  return { query, setQuery, q, matches };
}

function Search({ query, onChange }: { query: string; onChange: (v: string) => void }) {
  return (
    <SearchInput
      value={query}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search skills, trained or not"
      aria-label="Search skills"
      className="w-full sm:max-w-xs"
    />
  );
}

function Summary() {
  const total = GROUPS.reduce((n, g) => n + g.skills.length, 0);
  const have = GROUPS.reduce((n, g) => n + trainedCount(g), 0);
  return (
    <StatChips>
      <StatChip label="Trained" value={`${have} / ${total}`} />
      <StatChip label="In queue" value={String(GROUPS.reduce((n, g) => n + queuedCount(g), 0))} />
      <StatChip label="SP" value="48.2M" />
    </StatChips>
  );
}

function GroupTile({
  group,
  matchCount,
  open,
  onOpen,
}: {
  group: Group;
  matchCount?: number;
  open?: boolean;
  onOpen: () => void;
}) {
  const have = trainedCount(group);
  const total = group.skills.length;
  const queued = queuedCount(group);
  return (
    <NewComponent name="GroupTile">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded border border-line bg-panel p-3 text-left hover:border-accent-dim"
      >
        <TypeIcon typeId={group.iconTypeId} size={32} width={32} height={32} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{group.name}</span>
            <span className="shrink-0 text-xs text-dim tabular-nums">
              {matchCount !== undefined ? `${matchCount} match` : `${have} / ${total}`}
            </span>
          </span>
          <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-line">
            <span className="bg-accent" style={{ width: `${(have / total) * 100}%` }} />
            <span className="bg-warning/70" style={{ width: `${(queued / total) * 100}%` }} />
          </span>
        </span>
      </button>
    </NewComponent>
  );
}

function GroupSkillRow({ skill }: { skill: Skill }) {
  const need = skill.level < 0;
  return (
    <li className="flex items-center gap-3 border-t border-line px-3 py-2 first:border-t-0">
      <a href="#skill" className="min-w-0 flex-1 truncate text-sm text-accent hover:underline">
        {skill.name}
      </a>
      <span className="w-8 text-xs text-dim tabular-nums">x{skill.rank}</span>
      {need ? (
        <span className="rounded border border-warning/50 px-1.5 py-0.5 text-[0.6875rem] text-warning">
          Need book
        </span>
      ) : (
        <span className="w-12 text-right text-xs text-dim tabular-nums">
          {skill.level}
          {skill.queued ? ` → ${skill.queued}` : ''}
        </span>
      )}
      <SkillBar
        level={Math.max(skill.level, 0)}
        progress={skill.progress}
        plannedLevel={skill.queued}
      />
    </li>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
      <span>
        <span className="mr-1 inline-block size-2 bg-accent" />
        Trained
      </span>
      <span>
        <span className="mr-1 inline-block size-2 border border-accent-dim bg-accent-dim/40" />
        Queued
      </span>
      <span>
        <span className="mr-1 inline-block size-2 border border-line" />
        Not trained
      </span>
    </p>
  );
}

function GroupRows({ skills }: { skills: Skill[] }) {
  return (
    <ul className="rounded border border-line">
      {skills.map((s) => (
        <GroupSkillRow key={s.id} skill={s} />
      ))}
    </ul>
  );
}

function InPlace() {
  const { query, setQuery, q, matches } = useBoard();
  const [open, setOpen] = useState<string | null>('Gunnery');
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <Panel title="Trained skills">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Summary />
          <Search query={query} onChange={setQuery} />
        </div>
        <Legend />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(({ group: g, skills }) => {
            const expanded = q ? true : open === g.name;
            return (
              <div key={g.name} className={expanded ? 'sm:col-span-2 lg:col-span-3' : ''}>
                <GroupTile
                  group={g}
                  open={expanded}
                  matchCount={q ? skills.length : undefined}
                  onOpen={() => setOpen(open === g.name ? null : g.name)}
                />
                {expanded && (
                  <div className="mt-1 flex gap-2">
                    <Caret expanded />
                    <div className="min-w-0 flex-1">
                      <GroupRows skills={skills} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

const meta = {
  title: 'mockups/SkillsTrained',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/skills/trained' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Tile grid, a tile expands its skill list in place; searching expands every matching group. */
export const Proposed: Story = { render: () => <InPlace /> };

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = {
  render: () => <InPlace />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
