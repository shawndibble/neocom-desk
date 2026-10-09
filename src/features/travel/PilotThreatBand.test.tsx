import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import type { ThreatVerdict } from '@/engine/pilotList/threatVerdict';
import { PilotThreatBand } from './PilotThreatBand';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const DAY = 86_400_000;

function verdict(over: Partial<ThreatVerdict> = {}): ThreatVerdict {
  return {
    level: 'dangerous',
    recentKills: 12,
    lastKillMs: NOW - 3 * DAY,
    mainSpace: 'nullsec',
    alsoSpaces: [],
    podShare: 0.1,
    recentLosses: 0,
    lastLossMs: null,
    ratiosKnown: true,
    ...over,
  };
}

const chips = () => within(screen.getByRole('list')).getAllByRole('listitem');

describe('PilotThreatBand', () => {
  it('spells the level out in large type beside the sentence it was read from', () => {
    render(<PilotThreatBand verdict={verdict()} gangRatio={null} nowMs={NOW} />);
    const band = screen.getByRole('region', { name: 'Threat' });
    expect(within(band).getByText('Dangerous')).toHaveClass('text-danger');
    expect(within(band).getByText(/12 kills in the last 90 days. Last kill 3d ago./)).toBeTruthy();
  });

  it('colours the word by level, with no green', () => {
    const { rerender } = render(
      <PilotThreatBand verdict={verdict({ level: 'active' })} gangRatio={null} nowMs={NOW} />
    );
    expect(screen.getByText('Active')).toHaveClass('text-warning');
    rerender(
      <PilotThreatBand verdict={verdict({ level: 'inactive' })} gangRatio={null} nowMs={NOW} />
    );
    expect(screen.getByText('Inactive')).toHaveClass('text-text-dim');
    expect(document.body.innerHTML).not.toContain('success');
  });

  it('names the space they hunt in and any other space they use, every chip neutral', () => {
    render(
      <PilotThreatBand verdict={verdict({ alsoSpaces: ['lowsec'] })} gangRatio={null} nowMs={NOW} />
    );
    const [main, also] = chips();
    expect(main.textContent).toBe('Nullsec hunter');
    expect(main).toHaveClass('text-text');
    expect(also.textContent).toBe('Also Lowsec');
    expect(also).toHaveClass('text-text');
    expect(main.className).not.toMatch(/danger/);
  });

  it('adds a chip for gangs, or for mostly solo, only at the ends of the scale', () => {
    const { rerender } = render(<PilotThreatBand verdict={verdict()} gangRatio={99} nowMs={NOW} />);
    expect(chips().map((c) => c.textContent)).toContain('99% in gangs');
    rerender(<PilotThreatBand verdict={verdict()} gangRatio={20} nowMs={NOW} />);
    expect(chips().map((c) => c.textContent)).toContain('Mostly solo');
    rerender(<PilotThreatBand verdict={verdict()} gangRatio={50} nowMs={NOW} />);
    const texts = chips().map((c) => c.textContent);
    expect(texts).not.toContain('Mostly solo');
    expect(texts.some((text) => text?.includes('gangs'))).toBe(false);
  });

  it('leaves the all-time gang chip off an inactive pilot', () => {
    render(
      <PilotThreatBand
        verdict={verdict({ level: 'inactive', recentKills: 0, mainSpace: null, podShare: null })}
        gangRatio={99}
        nowMs={NOW}
      />
    );
    expect(screen.queryByText('99% in gangs')).toBeNull();
  });

  it('adds a pod chip from a quarter of the kills', () => {
    const { rerender } = render(
      <PilotThreatBand verdict={verdict({ podShare: 0.4 })} gangRatio={null} nowMs={NOW} />
    );
    expect(chips().map((c) => c.textContent)).toContain('40% of kills are pods');
    rerender(<PilotThreatBand verdict={verdict({ podShare: 0.1 })} gangRatio={null} nowMs={NOW} />);
    expect(chips().map((c) => c.textContent)).not.toContain('10% of kills are pods');
  });

  it('says so when the danger ratio could not be read for a pilot busy enough to be dangerous', () => {
    render(
      <PilotThreatBand
        verdict={verdict({ level: 'active', ratiosKnown: false })}
        gangRatio={null}
        nowMs={NOW}
      />
    );
    expect(screen.getByText(/danger ratio could not be read/)).toBeTruthy();
  });

  it('stays quiet about the ratio for a pilot who could not be dangerous anyway', () => {
    render(
      <PilotThreatBand
        verdict={verdict({ level: 'active', ratiosKnown: false, recentKills: 4 })}
        gangRatio={null}
        nowMs={NOW}
      />
    );
    expect(screen.queryByText(/danger ratio could not be read/)).toBeNull();
  });

  it('says a pilot with no kills but a recent loss lost a ship, and when', () => {
    render(
      <PilotThreatBand
        verdict={verdict({
          level: 'low',
          recentKills: 0,
          mainSpace: null,
          podShare: null,
          recentLosses: 2,
          lastLossMs: NOW - 3 * DAY,
        })}
        gangRatio={null}
        nowMs={NOW}
      />
    );
    expect(
      screen.getByText(/No kills in the last 90 days. 2 losses in that time, the latest 3d ago/)
    ).toBeTruthy();
  });

  it('reads an inactive pilot with no chips', () => {
    render(
      <PilotThreatBand
        verdict={verdict({
          level: 'inactive',
          recentKills: 0,
          mainSpace: null,
          podShare: null,
        })}
        gangRatio={null}
        nowMs={NOW}
      />
    );
    expect(screen.getByText(/No kills in the last 90 days. Last kill 3d ago./)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
