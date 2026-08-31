import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { QueueHealth } from './QueueHealth';

const NOW = Date.now();

async function seedQueue(characterId: number, entries: SkillQueueEntry[]) {
  await db.esiCache.put({ characterId, key: 'skillqueue', value: entries, fetchedAt: NOW });
}

beforeEach(async () => {
  await db.characters.clear();
  await db.esiCache.clear();
  await db.characters.bulkPut([
    { characterId: 91, name: 'Training Pilot', ownerHash: 'oh-1', addedAt: 1 },
    { characterId: 92, name: 'Paused Pilot', ownerHash: 'oh-2', addedAt: 2 },
    { characterId: 93, name: 'Idle Pilot', ownerHash: 'oh-3', addedAt: 3 },
    { characterId: 94, name: 'Cold Pilot', ownerHash: 'oh-4', addedAt: 4 },
  ]);
  await seedQueue(91, [
    {
      skill_id: 1,
      queue_position: 0,
      finished_level: 1,
      start_date: new Date(NOW - 60_000).toISOString(),
      finish_date: new Date(NOW + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);
  await seedQueue(92, [{ skill_id: 2, queue_position: 0, finished_level: 1 }]);
  await seedQueue(93, []);
  // Character 94 has no cached queue at all — never fetched.
});

describe('QueueHealth', () => {
  it('shows every character and its derived state in one place', async () => {
    render(<QueueHealth />);
    expect(await screen.findByText('Training Pilot')).toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('never labels a paused queue "starts now" or as idle', async () => {
    render(<QueueHealth />);
    await screen.findByText('Paused Pilot');
    expect(screen.queryByText(/starts now/i)).not.toBeInTheDocument();
    const pausedRow = screen.getByText('Paused Pilot').closest('li');
    expect(pausedRow).toHaveTextContent('Paused');
    expect(pausedRow).not.toHaveTextContent('Idle');
  });

  it('reads a character with no cached data as unknown, not idle', async () => {
    render(<QueueHealth />);
    const coldRow = (await screen.findByText('Cold Pilot')).closest('li');
    expect(coldRow).toHaveTextContent('Unknown');
    expect(coldRow).not.toHaveTextContent('Idle');
  });

  it('shows an empty state when there are no characters', async () => {
    await db.characters.clear();
    render(<QueueHealth />);
    expect(await screen.findByText(/no characters yet/i)).toBeInTheDocument();
  });
});
