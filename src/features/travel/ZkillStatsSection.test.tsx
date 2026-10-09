import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PilotStats } from '@/lib/zkillboard';
import {
  ZkillRatioMeters,
  ZkillStatsSection,
  ZkillStatsStatus,
  ZkillTopShips,
} from './ZkillStatsSection';

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

describe('ZkillRatioMeters', () => {
  it('shows danger, fleet size and kills against losses as meters that name the side they lean to', () => {
    render(<ZkillRatioMeters stats={base} />);
    const danger = screen.getByRole('meter', { name: 'Danger' });
    expect(danger).toHaveAttribute('aria-valuenow', '78');
    expect(danger).toHaveAttribute('aria-valuetext', '78% dangerous');
    const gang = screen.getByRole('meter', { name: 'Fleet size' });
    expect(gang).toHaveAttribute('aria-valuenow', '36');
    expect(gang).toHaveAttribute('aria-valuetext', '64% solo');
    const killer = screen.getByRole('meter', { name: 'Kills vs losses' });
    expect(killer).toHaveAttribute('aria-valuenow', '80');
    expect(killer).toHaveAttribute('aria-valuetext', '80% killer');
  });

  it('fills each meter along the gray-to-red ramp and keeps the readout plain text', () => {
    render(<ZkillRatioMeters stats={base} />);
    for (const [text, name, pct] of [
      ['78% dangerous', 'Danger', 78],
      ['64% solo', 'Fleet size', 36],
      ['80% killer', 'Kills vs losses', 80],
    ] as const) {
      expect(screen.getByText(text)).toHaveClass('text-text');
      const fill = screen.getByRole('meter', { name }).firstElementChild as HTMLElement;
      expect(fill.style.width).toBe(`${pct}%`);
      expect(fill.style.backgroundColor).not.toBe('');
    }
  });

  it('puts the three meters in one "How they fight" card', () => {
    render(<ZkillRatioMeters stats={base} />);
    const card = screen.getByRole('region', { name: 'How they fight' });
    expect(within(card).getAllByRole('meter')).toHaveLength(3);
  });

  it('reads the danger ratio as a share of danger at either end of its scale', () => {
    render(<ZkillRatioMeters stats={{ ...base, dangerRatio: 42 }} />);
    expect(screen.getByRole('meter', { name: 'Danger' })).toHaveAttribute(
      'aria-valuetext',
      '42% dangerous'
    );
  });

  it('reads a record with more losses than kills as a victim, and 50 as even', () => {
    const { rerender } = render(<ZkillRatioMeters stats={{ ...base, kills: 10, losses: 30 }} />);
    expect(screen.getByRole('meter', { name: 'Kills vs losses' })).toHaveAttribute(
      'aria-valuetext',
      '75% victim'
    );
    rerender(<ZkillRatioMeters stats={{ ...base, kills: 30, losses: 30 }} />);
    const killer = screen.getByRole('meter', { name: 'Kills vs losses' });
    expect(killer).toHaveAttribute('aria-valuetext', 'Even, 50/50');
    expect(screen.getByText('Even, 50/50')).toHaveClass('text-text');
  });

  it('labels the ends of the kills meter Victim and Killer', () => {
    render(<ZkillRatioMeters stats={base} />);
    expect(screen.getByText('Victim')).toBeInTheDocument();
    expect(screen.getByText('Killer')).toBeInTheDocument();
  });

  it('leaves out a meter zKillboard sent no ratio for', () => {
    render(<ZkillRatioMeters stats={{ ...base, dangerRatio: null }} />);
    expect(screen.queryByRole('meter', { name: 'Danger' })).toBeNull();
    expect(screen.getByRole('meter', { name: 'Fleet size' })).toBeInTheDocument();
  });

  it('draws nothing with no ratio and no record', () => {
    const { container } = render(
      <ZkillRatioMeters
        stats={{ ...base, dangerRatio: null, gangRatio: null, kills: 0, losses: 0 }}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('ZkillStatsSection', () => {
  it('states the all-time figures as one line, kills green and losses red', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} />);
    expect(screen.getByText('120 kills')).toHaveClass('text-isk-pos');
    expect(screen.getByText('30 losses')).toHaveClass('text-isk-neg');
    expect(screen.getByText('40 solo kills')).toBeInTheDocument();
    expect(screen.getByText(/destroyed/)).toBeInTheDocument();
    expect(screen.getByText(/lost/)).toBeInTheDocument();
  });

  it('draws no tiles, no meters and no ISK efficiency of its own', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.queryByRole('term')).toBeNull();
    expect(screen.queryByText('ISK efficiency')).toBeNull();
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
