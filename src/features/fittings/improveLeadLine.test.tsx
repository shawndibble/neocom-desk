import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import type { ImproveOption } from '@/engine/fittings/improve';
import type { FittingStats } from '@/engine/fittings/types';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import { leadLine } from './improveLeadLine';
import { lostLine } from './improveChangeLines';

const t = i18n.t.bind(i18n);

const explore = (strength: number, coherence: number) =>
  ({
    ...baseFittingStats(),
    explore: {
      modules: 3,
      hacking: { strength, coherence, cycleSeconds: 10 },
      scanning: { strength: 10, duration: 0, deviation: 0 },
      analyzers: [],
    },
  }) as unknown as FittingStats;

describe('the Explore better lead', () => {
  it('stacks the hacking figures that change, one row each, like EHP and Shield HP', () => {
    const option = { after: explore(130, 50) } as unknown as ImproveOption;
    const lead = leadLine(t, { goal: 'explore', hold: 'cargo' }, option, explore(110, 40));
    render(<>{lead?.node}</>);
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/Hacking strength/);
    expect(rows[1]).toMatch(/Coherence/);
    expect(rows.join()).not.toMatch(/Cycle|Scan strength|Scan time cut|Deviation cut/);
  });
});

describe('a swap that moves no Explore figure', () => {
  it('has no lead: an unchanged figure is not shown', () => {
    const option = { after: explore(110, 40) } as unknown as ImproveOption;
    expect(leadLine(t, { goal: 'explore', hold: 'cargo' }, option, explore(110, 40))).toBeNull();
  });
});

describe('Gives up', () => {
  it('leaves out a loss the rows above already show', () => {
    const before = { ...baseFittingStats(), ehp: 4429 } as FittingStats;
    const option = {
      after: { ...before, ehp: 4404 },
      lost: [
        { kind: 'stat', change: { key: 'ehp', before: 4429, after: 4404 } },
        { kind: 'stat', change: { key: 'calibrationUsed', before: 275, after: 325 } },
      ],
    } as unknown as ImproveOption;
    render(<>{lostLine(t, option, ['ehp'])}</>);
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/Calibration used/);
  });
});
