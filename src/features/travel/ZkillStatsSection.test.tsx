import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PilotStats } from '@/lib/zkillboard';
import { ZkillStatsSection, ZkillStatsStatus, ZkillTopShips } from './ZkillStatsSection';

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () =>
    Promise.resolve(
      new Map([
        [29990, 'Loki'],
        [22456, 'Sabre'],
      ])
    ),
}));

const base: PilotStats = {
  kills: 120,
  losses: 30,
  iskDestroyed: 9e9,
  iskLost: 1e9,
  iskEfficiency: 0.9,
  soloKills: 40,
  dangerRatio: 78,
  gangRatio: 36,
  topShips: [],
  memberCount: null,
};

describe('ZkillStatsSection', () => {
  it('shows both ratios as meters that name the side they lean to', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} />);
    const danger = screen.getByRole('meter', { name: 'Danger' });
    expect(danger).toHaveAttribute('aria-valuenow', '78');
    expect(danger).toHaveAttribute('aria-valuetext', '78% dangerous');
    const gang = screen.getByRole('meter', { name: 'Fleet size' });
    expect(gang).toHaveAttribute('aria-valuenow', '36');
    expect(gang).toHaveAttribute('aria-valuetext', '64% solo');
  });

  it('colours each meter by the end it leans to: red to the high end, green to the low', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} />);
    expect(screen.getByText('78% dangerous')).toHaveClass('text-danger');
    expect(screen.getByText('64% solo')).toHaveClass('text-success');
  });

  it('reads exactly 50 as even, in words and in colour', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: { ...base, dangerRatio: 50 } }} />);
    const danger = screen.getByRole('meter', { name: 'Danger' });
    expect(danger).toHaveAttribute('aria-valuetext', 'Even, 50/50');
    expect(screen.getByText('Even, 50/50')).toHaveClass('text-text');
  });

  it('leaves out a meter zKillboard sent no ratio for', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: { ...base, dangerRatio: null } }} />);
    expect(screen.queryByRole('meter', { name: 'Danger' })).toBeNull();
    expect(screen.getByRole('meter', { name: 'Fleet size' })).toBeInTheDocument();
  });

  it('reads kills green and losses red', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} />);
    expect(screen.getByText('120')).toHaveClass('text-isk-pos');
    expect(screen.getByText('30')).toHaveClass('text-isk-neg');
  });

  it('leaves ISK efficiency out: the danger ratio already is kills against losses', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} />);
    expect(screen.queryByText('ISK efficiency')).toBeNull();
    expect(screen.queryByText('90.0%')).toBeNull();
  });

  it('leaves the meters to the caller when it draws them above', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} metersAbove />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByText('120')).toBeInTheDocument();
  });
});

describe('ZkillStatsStatus', () => {
  it('says a corporation, not a pilot, has no history', () => {
    render(<ZkillStatsStatus stats={{ kind: 'no-history' }} subject="corporation" />);
    expect(screen.getByText(/for this corporation/)).toBeInTheDocument();
  });

  it('renders nothing once the stats are in', () => {
    const { container } = render(
      <ZkillStatsStatus stats={{ kind: 'stats', stats: base }} subject="pilot" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ZkillTopShips', () => {
  it('ranks the hulls in order with their names and kill counts', async () => {
    render(
      <MemoryRouter>
        <ZkillTopShips
          ships={[
            { shipTypeId: 29990, kills: 612 },
            { shipTypeId: 22456, kills: 306 },
          ]}
        />
      </MemoryRouter>
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(await within(items[0]).findByText('Loki')).toBeInTheDocument();
    expect(within(items[0]).getByText('612 kills')).toBeInTheDocument();
    expect(within(items[1]).getByText('Sabre')).toBeInTheDocument();
    expect(within(items[1]).getByText('306 kills')).toBeInTheDocument();
  });
});
