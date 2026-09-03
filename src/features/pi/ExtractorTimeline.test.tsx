import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import { ExtractorTimeline } from './ExtractorTimeline';
import type { PiRosterSnapshot, TimelineProgram } from './roster';

const NOW = Date.parse('2026-09-03T00:00:00Z');
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function program(overrides: Partial<TimelineProgram> & { expiryTimeMs: number }): TimelineProgram {
  const { expiryTimeMs, ...rest } = overrides;
  return {
    characterId: 91,
    characterName: 'Pilot One',
    planetId: 40000001,
    solarSystemId: 30000142,
    planetName: 'Jita IV',
    productName: null,
    program: { pinId: 1, expiryTimeMs },
    ...rest,
  };
}

function snapshot(overrides: Partial<PiRosterSnapshot> = {}): PiRosterSnapshot {
  return {
    programs: [],
    colonyCount: 0,
    coloniesWithoutDetail: 0,
    skipped: [],
    notLoaded: [],
    noColonies: [],
    ...overrides,
  };
}

describe('ExtractorTimeline', () => {
  it('lists programs from every character worst-first, reusing the colony ordering', () => {
    render(
      <ExtractorTimeline
        nowMs={NOW}
        snapshot={snapshot({
          colonyCount: 3,
          programs: [
            program({
              characterId: 92,
              characterName: 'Healthy Alt',
              planetName: 'Amarr V',
              expiryTimeMs: NOW + 10 * DAY_MS,
            }),
            program({
              characterId: 93,
              characterName: 'Soon Alt',
              planetName: 'Dodixie III',
              expiryTimeMs: NOW + 6 * HOUR_MS,
            }),
            program({
              characterId: 91,
              characterName: 'Idle Main',
              planetName: 'Jita IV',
              expiryTimeMs: NOW - DAY_MS,
            }),
          ],
        })}
      />
    );

    const rows = within(
      screen.getByRole('list', { name: /needing attention first/i })
    ).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Idle Main');
    expect(rows[1]).toHaveTextContent('Soon Alt');
    expect(rows[2]).toHaveTextContent('Healthy Alt');
  });

  it('names an expired program in text, not by bar colour alone', () => {
    render(
      <ExtractorTimeline
        nowMs={NOW}
        snapshot={snapshot({ colonyCount: 1, programs: [program({ expiryTimeMs: NOW - DAY_MS })] })}
      />
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Expired');
  });

  it('says "expiring soon" in words as well as in colour', () => {
    render(
      <ExtractorTimeline
        nowMs={NOW}
        snapshot={snapshot({
          colonyCount: 1,
          programs: [program({ expiryTimeMs: NOW + 3 * HOUR_MS })],
        })}
      />
    );
    expect(screen.getByRole('listitem')).toHaveTextContent(/Expiring soon/i);
  });

  it('distinguishes "not loaded yet" from "no colonies" and from "skipped"', () => {
    render(
      <ExtractorTimeline
        nowMs={NOW}
        snapshot={snapshot({
          notLoaded: [{ characterId: 92, name: 'Unread Alt' }],
          noColonies: [{ characterId: 93, name: 'Colonyless Alt' }],
          skipped: [{ characterId: 94, name: 'Scopeless Alt' }],
        })}
      />
    );

    const notLoaded = screen.getByText(/Unread Alt/);
    const noColonies = screen.getByText(/Colonyless Alt/);
    const skipped = screen.getByText(/Scopeless Alt/);

    // Three separate lines saying three different things — the whole point is
    // that a reader can tell which fact applies to which character.
    expect(notLoaded).not.toBe(noColonies);
    expect(notLoaded).toHaveTextContent(/not loaded yet/i);
    expect(noColonies).toHaveTextContent(/No colonies/i);
    expect(skipped).toHaveTextContent(/no planetary access/i);
  });

  it('counts idle programs and the soonest expiry in the stat strip', () => {
    render(
      <ExtractorTimeline
        nowMs={NOW}
        snapshot={snapshot({
          colonyCount: 2,
          skipped: [{ characterId: 94, name: 'Scopeless Alt' }],
          programs: [
            program({ expiryTimeMs: NOW - DAY_MS }),
            program({ planetId: 40000002, expiryTimeMs: NOW + 2 * DAY_MS }),
          ],
        })}
      />
    );

    expect(screen.getByText('Colonies').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Idle').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Next Expiry').parentElement).toHaveTextContent('2d');
    expect(screen.getByText('Skipped').parentElement).toHaveTextContent('1');
  });

  it('reads "no programs cached" as its own state, not as an empty list', () => {
    render(<ExtractorTimeline nowMs={NOW} snapshot={snapshot()} />);
    expect(screen.getByText(/No extractor programs cached/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: /needing attention first/i })
    ).not.toBeInTheDocument();
  });

  /**
   * docs/DESIGN.md §4a: one DOM at every width. Asserted against the source
   * because that is the actual rule — a rendering test at one viewport cannot
   * see a second subtree that only appears at another, and jsdom has no
   * viewport to test at. The responsive collapse must come from grid flow
   * (`grid-cols-1 sm:grid-cols-[...]`), never from rendering the row twice.
   */
  it('renders one DOM at every width — no breakpoint-conditional subtree', () => {
    // Comments stripped first: the component's own header explains the rule
    // by naming the classes it forbids, and a scan that counted that prose as
    // a violation would only teach the next author to stop explaining it.
    const code = readFileSync('src/features/pi/ExtractorTimeline.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toMatch(/\bsm:hidden\b/);
    expect(code).not.toMatch(/\bhidden\s+sm:(block|flex|grid|inline|table)/);
    expect(code).not.toMatch(/<svg/i);
    // The collapse itself, positively: a one-column grid that gains its label
    // column at `sm`.
    expect(code).toMatch(/grid-cols-1[^"`]*sm:grid-cols-\[/);
  });
});
