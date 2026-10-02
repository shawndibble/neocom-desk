import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { PilotStats } from '@/lib/zkillboard';
import { ZkillStatsSection } from './ZkillStatsSection';

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () => Promise.resolve(new Map()),
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
};

describe('ZkillStatsSection', () => {
  it('shows both ratios as meters that name the side they lean to', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} subject="pilot" />);
    const danger = screen.getByRole('meter', { name: 'Danger' });
    expect(danger).toHaveAttribute('aria-valuenow', '78');
    expect(danger).toHaveAttribute('aria-valuetext', '78% dangerous');
    const gang = screen.getByRole('meter', { name: 'Fleet size' });
    expect(gang).toHaveAttribute('aria-valuenow', '36');
    expect(gang).toHaveAttribute('aria-valuetext', '64% solo');
  });

  it('leaves out a meter zKillboard sent no ratio for', () => {
    render(
      <ZkillStatsSection
        stats={{ kind: 'stats', stats: { ...base, dangerRatio: null } }}
        subject="pilot"
      />
    );
    expect(screen.queryByRole('meter', { name: 'Danger' })).toBeNull();
    expect(screen.getByRole('meter', { name: 'Fleet size' })).toBeInTheDocument();
  });

  it('explains ISK efficiency behind a help button', () => {
    render(<ZkillStatsSection stats={{ kind: 'stats', stats: base }} subject="pilot" />);
    expect(screen.getByRole('button', { name: 'About ISK efficiency' })).toBeInTheDocument();
    expect(screen.getByText('90.0%')).toBeInTheDocument();
  });

  it('says a corporation, not a pilot, has no history', () => {
    render(<ZkillStatsSection stats={{ kind: 'no-history' }} subject="corporation" />);
    expect(screen.getByText(/for this corporation/)).toBeInTheDocument();
  });
});
