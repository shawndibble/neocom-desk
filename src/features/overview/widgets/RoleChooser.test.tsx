import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import type { CorpAccessState } from '@/features/corp/useCorpAccess';
import type { OverviewLayout } from './layout';
import { RoleChooser } from './RoleChooser';

const access = vi.hoisted(() => ({
  current: { state: 'unknown', capabilities: {} } as {
    state: CorpAccessState;
    capabilities: CorpCapabilities;
  },
}));
vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: () => access.current }));

async function buildMiner(state: CorpAccessState, capabilities: CorpCapabilities) {
  access.current = { state, capabilities };
  const user = userEvent.setup();
  let built: OverviewLayout | null = null;
  render(<RoleChooser firstRun onChoose={(l) => (built = l)} />);
  await user.click(screen.getByRole('button', { name: 'Miner' }));
  await user.click(screen.getByRole('button', { name: 'Build my Overview' }));
  return (built as OverviewLayout | null)?.widgets.map((w) => w.kind) ?? [];
}

const moons = { ...NO_CORP_CAPABILITIES, canReadMoonExtractions: true };

describe('RoleChooser corp kinds', () => {
  it('keeps a corp kind the ready grant can read', async () => {
    expect(await buildMiner('ready', moons)).toContain('moonChunks');
  });

  it('leaves it out for an NPC-corp character', async () => {
    expect(await buildMiner('none', NO_CORP_CAPABILITIES)).not.toContain('moonChunks');
  });

  it('leaves it out when the grant lacks the scope the role needs', async () => {
    // A blocked grant still reports the role's capability; the widget could not read it.
    expect(await buildMiner('roles-without-grant', moons)).not.toContain('moonChunks');
  });
});
