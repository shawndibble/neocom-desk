import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CurrentQueuePanel } from './CurrentQueuePanel';
import { buildQueueView } from './queueView';
import { classifySkillQueue } from '@/engine/skills/queueStatus';
import type { CachedResult } from '../data';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { SkillCatalog } from '../skillMap';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

const catalog = {
  bySkillTypeID: new Map([
    [
      1,
      {
        name: 'Mining Exploitation',
        groupName: 'Resource Processing',
        primaryAttr: 'intelligence',
        secondaryAttr: 'memory',
      },
    ],
    [
      2,
      {
        name: 'Sharpshooter',
        groupName: 'Gunnery',
        primaryAttr: 'perception',
        secondaryAttr: 'willpower',
      },
    ],
    [
      3,
      {
        name: 'Accounting',
        groupName: 'Trade',
        primaryAttr: 'intelligence',
        secondaryAttr: 'memory',
      },
    ],
  ]),
} as unknown as SkillCatalog;

function result(entries: SkillQueueEntry[]): CachedResult<SkillQueueEntry[]> {
  return { data: entries, fetchedAt: new Date(NOW), fromCache: false, truncated: false };
}

function renderPanel(entries: SkillQueueEntry[]) {
  const res = result(entries);
  const view = buildQueueView(classifySkillQueue(entries, NOW), NOW, 'monday');
  return render(
    <MemoryRouter>
      <CurrentQueuePanel result={res} view={view} catalog={catalog} nowMs={NOW} />
    </MemoryRouter>
  );
}

const QUEUE: SkillQueueEntry[] = [
  {
    skill_id: 1,
    queue_position: 0,
    finished_level: 5,
    start_date: at(-1),
    finish_date: at(1),
    training_start_sp: 0,
    level_end_sp: 4_800,
  },
  { skill_id: 2, queue_position: 1, finished_level: 5, start_date: at(1), finish_date: at(8) },
  { skill_id: 3, queue_position: 2, finished_level: 4, start_date: at(8), finish_date: at(40) },
];

describe('CurrentQueuePanel', () => {
  it('shows the level training now as a card with its time left, progress and SP/hr', () => {
    renderPanel(QUEUE);
    const card = screen.getByRole('region', { name: 'Training now' });
    expect(card).toHaveTextContent('Mining Exploitation');
    expect(card).toHaveTextContent('V');
    expect(card).toHaveTextContent('Intelligence + Memory');
    expect(card).toHaveTextContent('100 SP/hr');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(card).toHaveTextContent('Next: Sharpshooter V');
  });

  it('groups what is queued behind it by period, with count and time', () => {
    renderPanel(QUEUE);
    expect(screen.getByRole('heading', { name: 'This month' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'November' })).toBeInTheDocument();
    expect(screen.getByText('1 skill · 7d 0h')).toBeInTheDocument();
    expect(screen.getByText('1 skill · 32d 0h')).toBeInTheDocument();
    expect(screen.getByText('Gunnery')).toBeInTheDocument();
  });

  it('does not list the training level a second time in the groups', () => {
    renderPanel(QUEUE);
    expect(screen.getAllByText(/Mining Exploitation/)).toHaveLength(1);
  });

  it('says so when ESI reports no queue', () => {
    renderPanel([]);
    expect(screen.getByText('No active in-game training queue cached.')).toBeInTheDocument();
  });

  it('lists a paused queue under Paused, with no training card', () => {
    renderPanel([{ skill_id: 1, queue_position: 0, finished_level: 3 }]);
    expect(screen.queryByRole('region', { name: 'Training now' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument();
    expect(
      screen.getByText('Training is paused, so EVE reports no completion times.')
    ).toBeInTheDocument();
  });

  it('shows a spinner while the first read is in flight', () => {
    const view = buildQueueView([], NOW, 'monday');
    render(
      <MemoryRouter>
        <CurrentQueuePanel result={undefined} view={view} catalog={catalog} nowMs={NOW} />
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('CurrentQueuePanel as a link target', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    // jsdom has no scrollIntoView of its own; drop the stub so it cannot leak.
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('scrolls itself into view and takes focus when the URL names it (#current-queue)', () => {
    window.history.replaceState({}, '', '/skills/plans#current-queue');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPanel(QUEUE);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Current skill queue' })).toHaveFocus();
  });

  it('leaves scroll and focus alone without the hash', () => {
    window.history.replaceState({}, '', '/skills/plans');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPanel(QUEUE);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
