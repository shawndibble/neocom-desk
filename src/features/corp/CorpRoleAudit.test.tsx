import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';

const CHANGED_AT = Date.UTC(2026, 9, 15, 23, 30);
const fixture = vi.hoisted(() => ({ changes: [] as unknown[], loadedAt: 0 }));

vi.mock('@/lib/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({
    hydrated: true,
    loading: false,
    refresh: vi.fn(),
    refreshCount: 0,
    activeCharacterId: 1,
    data: {
      needsReauth: false,
      loadedAt: fixture.loadedAt,
      audit: {
        holders: [
          { characterId: 1, roles: ['Director'], titles: [] },
          { characterId: 2, roles: ['Accountant'], titles: [] },
          { characterId: 3, roles: ['Director'], titles: [] },
        ],
        changes: fixture.changes,
        titlesKnown: false,
        names: new Map([
          [1, 'Alpha'],
          [2, 'Beta'],
          [3, 'Gamma'],
        ]),
        ceoId: 3,
        fetchedAt: null,
        fromCache: false,
      },
    },
  }),
}));
vi.mock('./boardData', () => ({ loadCorporationId: vi.fn() }));
vi.mock('./roleAudit', () => ({ loadRoleAudit: vi.fn() }));

import { CorpRoleAudit } from './CorpRoleAudit';

afterEach(() => {
  process.env.TZ = originalTz;
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: true });
  fixture.changes = [];
  fixture.loadedAt = 0;
});

const originalTz = process.env.TZ;

describe('CorpRoleAudit', () => {
  it('prints a role change in EVE time when the Time format says so', () => {
    process.env.TZ = 'Pacific/Auckland';
    fixture.loadedAt = CHANGED_AT;
    fixture.changes = [
      { characterId: 1, issuerId: 2, changedAtMs: CHANGED_AT, granted: ['Director'], removed: [] },
    ];
    const when = new Date(CHANGED_AT);
    const view = () => (
      <MemoryRouter>
        <CorpRoleAudit tabs={{ bar: null, tabsId: 't', tabId: 'x' }} />
      </MemoryRouter>
    );
    const local = render(view());
    expect(screen.getByText(formatTimestamp(when))).toBeInTheDocument();
    local.unmount();
    useTimeFormat.setState({ value: 'eve', hydrated: true });
    render(view());
    expect(screen.getByText(formatTimestamp(when, 'UTC'))).toBeInTheDocument();
    expect(formatTimestamp(when, 'UTC')).not.toBe(formatTimestamp(when));
  });

  it('prints the holders summary sentence, not the raw key', () => {
    render(
      <MemoryRouter>
        <CorpRoleAudit tabs={{ bar: null, tabsId: 't', tabId: 'x' }} />
      </MemoryRouter>
    );
    expect(screen.getByText('2 Directors. Members with a sensitive role: 3.')).toBeInTheDocument();
  });

  it('marks the CEO in the holders table', () => {
    render(
      <MemoryRouter>
        <CorpRoleAudit tabs={{ bar: null, tabsId: 't', tabId: 'x' }} />
      </MemoryRouter>
    );
    const holders = screen.getByRole('table', { name: 'Members with sensitive roles' });
    expect(
      within(within(holders).getByText('Gamma').closest('tr')!).getByText('CEO')
    ).toBeVisible();
    expect(within(holders.querySelectorAll('tr')[1] as HTMLElement).queryByText('CEO')).toBeNull();
  });

  it('opens the ⋮ on a holder with the member actions', async () => {
    render(
      <MemoryRouter>
        <CorpRoleAudit tabs={{ bar: null, tabsId: 't', tabId: 'x' }} />
      </MemoryRouter>
    );
    const holders = screen.getByRole('table', { name: 'Members with sensitive roles' });
    await userEvent.click(within(holders).getAllByRole('button', { name: /More actions for/ })[0]!);
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Open in EVE/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /zKillboard/ })).toBeInTheDocument();
  });

  it('opens the ⋮ on a role-change line with the member actions', async () => {
    fixture.loadedAt = CHANGED_AT;
    fixture.changes = [
      { characterId: 1, issuerId: 2, changedAtMs: CHANGED_AT, granted: ['Director'], removed: [] },
    ];
    render(
      <MemoryRouter>
        <CorpRoleAudit tabs={{ bar: null, tabsId: 't', tabId: 'x' }} />
      </MemoryRouter>
    );
    const history = screen.getByRole('table', { name: /role changes|history/i });
    await userEvent.click(within(history).getAllByRole('button', { name: /More actions for/ })[0]!);
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /zKillboard/ })).toBeInTheDocument();
  });
});
