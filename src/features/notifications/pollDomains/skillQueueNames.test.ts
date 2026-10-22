import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadUniverseType } from '@/features/skills/data';
import { loadSkills } from '@/sde/loadSde';
import { skillQueueDomain } from './skillQueue';

vi.mock('@/features/skills/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/skills/data')>();
  return { ...actual, loadUniverseType: vi.fn() };
});
vi.mock('@/sde/loadSde', () => ({ loadSkills: vi.fn() }));

const fire = {
  eventId: 'skillLevelComplete',
  characterId: 7,
  skillId: 3405,
  level: 4,
} as Parameters<typeof skillQueueDomain.render>[0];

describe('skillQueueDomain.render skill name', () => {
  beforeEach(() => {
    vi.mocked(loadUniverseType).mockReset();
    vi.mocked(loadSkills).mockReset();
  });

  it('names the skill from the SDE without touching ESI', async () => {
    vi.mocked(loadSkills).mockResolvedValue([{ typeID: 3405, name: 'Drones' }] as never);
    expect((await skillQueueDomain.render(fire, 'Kestrel')).body).toBe(
      'Kestrel finished training Drones IV.'
    );
    expect(loadUniverseType).not.toHaveBeenCalled();
  });

  it('falls back to ESI for a skill the SDE lacks, or when the SDE will not load', async () => {
    vi.mocked(loadUniverseType).mockResolvedValue({ data: { name: 'New Skill' } } as never);
    vi.mocked(loadSkills).mockResolvedValue([]);
    expect((await skillQueueDomain.render(fire, 'Kestrel')).body).toContain('New Skill');
    vi.mocked(loadSkills).mockRejectedValue(new Error('offline'));
    expect((await skillQueueDomain.render(fire, 'Kestrel')).body).toContain('New Skill');
  });
});
