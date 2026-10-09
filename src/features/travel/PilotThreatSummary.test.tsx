import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import type { ThreatVerdict } from '@/engine/pilotList/threatVerdict';
import { PilotThreatSummary } from './PilotThreatSummary';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const DAY = 86_400_000;

function verdict(over: Partial<ThreatVerdict> = {}): ThreatVerdict {
  return {
    level: 'active',
    recentKills: 12,
    lastKillMs: NOW - 3 * DAY,
    mainSpace: 'nullsec',
    podShare: 0.1,
    dangerKnown: true,
    ...over,
  };
}

describe('PilotThreatSummary', () => {
  it('reads the window, the main space and the age of the last kill', () => {
    render(<PilotThreatSummary verdict={verdict()} gangRatio={null} nowMs={NOW} />);
    expect(
      screen.getByText(/12 kills in the last 90 days, mostly in nullsec. Last kill 3d ago/)
    ).toBeTruthy();
  });

  it('says so when the danger ratio could not be read for a pilot busy enough to be dangerous', () => {
    render(
      <PilotThreatSummary verdict={verdict({ dangerKnown: false })} gangRatio={null} nowMs={NOW} />
    );
    expect(screen.getByText(/danger ratio could not be read/)).toBeTruthy();
  });

  it('stays quiet about the ratio for a pilot who could not be dangerous anyway', () => {
    render(
      <PilotThreatSummary
        verdict={verdict({ dangerKnown: false, recentKills: 4 })}
        gangRatio={null}
        nowMs={NOW}
      />
    );
    expect(screen.queryByText(/danger ratio could not be read/)).toBeNull();
  });

  it('names gang and pod shares only when they stand out', () => {
    const { rerender } = render(
      <PilotThreatSummary verdict={verdict()} gangRatio={99} nowMs={NOW} />
    );
    expect(screen.getByText('99% in gangs')).toBeTruthy();
    expect(screen.queryByText(/pods/)).toBeNull();
    rerender(
      <PilotThreatSummary verdict={verdict({ podShare: 0.4 })} gangRatio={30} nowMs={NOW} />
    );
    expect(screen.getByText('40% of kills are pods')).toBeTruthy();
    expect(screen.queryByText(/in gangs/)).toBeNull();
  });

  it('reads an inactive pilot without a space or a count', () => {
    render(
      <PilotThreatSummary
        verdict={verdict({ level: 'inactive', recentKills: 0, mainSpace: null, podShare: null })}
        gangRatio={null}
        nowMs={NOW}
      />
    );
    expect(screen.getByText(/No kills in the last 90 days. Last kill 3d ago/)).toBeTruthy();
  });
});
