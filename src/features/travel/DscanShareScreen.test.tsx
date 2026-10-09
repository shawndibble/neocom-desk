import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildDscanSnapshot, parseDscanSnapshot } from '@/engine/pilotList/dscanSnapshot';
import { classifyPilotPaste } from '@/engine/pilotList/parsePilotPaste';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({
    '626': { name: 'Vexor', groupID: 26 },
    '23773': { name: 'Ragnarok', groupID: 30 },
    '1': { name: 'Drone', groupID: 100 },
  }),
  loadGroupCategories: async () => ({ '26': 6, '30': 6, '100': 18 }),
}));

import { DscanShareScreen } from './DscanShareScreen';
import { PilotListView } from './PilotListView';

const SCAN =
  '626\tA\tVexor\t1 km\n626\tB\tVexor\t2 km\n23773\tC\tRagnarok\t3 AU\n1\tD\tDrone\t1 km';

afterEach(cleanup);

describe('Shared D-Scan', () => {
  it('rebuilds the same roles and ship list the sender saw', async () => {
    const sender = classifyPilotPaste(SCAN);
    if (sender?.kind !== 'dscan') throw new Error('expected a D-Scan');
    const built = buildDscanSnapshot(SCAN);
    if (!built.ok) throw new Error('expected a snapshot');
    const scan = parseDscanSnapshot(JSON.parse(JSON.stringify(built.value)));
    if (scan === null) throw new Error('expected a scan');

    const live = render(
      <MemoryRouter>
        <PilotListView paste={sender} />
      </MemoryRouter>
    );
    await screen.findByText('Ragnarok');
    const senderSections = [...live.container.querySelectorAll('section[aria-label]')].map(
      (el) => el.textContent
    );
    cleanup();

    const shared = render(
      <MemoryRouter>
        <DscanShareScreen
          state={{ status: 'ready', rows: scan.rows }}
          expiresAt={Date.UTC(2026, 9, 15)}
        />
      </MemoryRouter>
    );
    await screen.findByText('Ragnarok');
    const recipientSections = [...shared.container.querySelectorAll('section[aria-label]')].map(
      (el) => el.textContent
    );
    expect(recipientSections).toEqual(senderSections);
    expect(senderSections).toHaveLength(3);
    expect(screen.getByText(/Expires/)).toBeTruthy();
  });

  it('offers a visitor with no Character a login, with permissions to choose first', async () => {
    render(
      <MemoryRouter>
        <DscanShareScreen
          state={{ status: 'invalid' }}
          expiresAt={Date.now()}
          openInApp={{ path: '/pilot-lookup?share=abc' }}
        />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Log in with EVE Online' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose permissions…' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open Neocom Desk' })).toBeNull();
  });

  it('says so when the stored payload is not a readable scan', () => {
    render(
      <MemoryRouter>
        <DscanShareScreen state={{ status: 'invalid' }} expiresAt={Date.now()} />
      </MemoryRouter>
    );
    expect(screen.getByText("This link isn't valid")).toBeTruthy();
  });
});
