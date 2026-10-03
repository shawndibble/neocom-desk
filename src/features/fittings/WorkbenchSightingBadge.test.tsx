import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { WorkbenchFit } from './workbenchFits';
import type { WorkbenchSighting } from './workbenchSightings';

const { useWorkbenchSightingsMock } = vi.hoisted(() => ({ useWorkbenchSightingsMock: vi.fn() }));
vi.mock('./workbenchSightings', () => ({ useWorkbenchSightings: useWorkbenchSightingsMock }));
vi.mock('./popularFits', () => ({ usePopularFits: () => ({ ok: true, fits: [] }) }));
vi.mock('./loadFittingFromText', () => ({ loadFittingFromText: vi.fn() }));
vi.mock('@/sde/loadSde', () => ({ typeName: (typeId: number) => Promise.resolve(`#${typeId}`) }));

const FITS: WorkbenchFit[] = ['a', 'b'].map((id) => ({
  id,
  name: `Fit ${id}`,
  authorId: 1,
  authorName: 'Saryna Dach',
  dateAdded: 0,
  eft: `[Vexor, Fit ${id}]`,
}));
vi.mock('./workbenchFits', () => ({
  useWorkbenchFits: () => ({ ok: true, fits: FITS }),
  workbenchFitUrl: (id: string) => `https://eveworkbench.com/fit/${id}`,
}));

import { PopularFitsPanel } from './PopularFitsPanel';
import { WorkbenchSightingBadge } from './WorkbenchSightingBadge';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe('WorkbenchSightingBadge', () => {
  it('shows the matching loss count and when one was last seen', () => {
    render(<WorkbenchSightingBadge sighting={{ count: 3, lastSeen: daysAgo(2) }} />);
    expect(screen.getByText('Seen on zKillboard: 3 recent losses · last seen 2d ago')).toBeTruthy();
  });

  it('says "loss" for one, and leaves out last seen when no loss carried a time', () => {
    render(<WorkbenchSightingBadge sighting={{ count: 1, lastSeen: null }} />);
    expect(screen.getByText('Seen on zKillboard: 1 recent loss')).toBeTruthy();
  });

  it('shows nothing for a fit that was not seen', () => {
    const { container } = render(<WorkbenchSightingBadge sighting={undefined} />);
    expect(container.textContent).toBe('');
  });
});

describe('PopularFitsPanel EVE Workbench sightings', () => {
  it('badges only the Workbench fits seen on zKillboard', () => {
    useWorkbenchSightingsMock.mockReturnValue(
      new Map<string, WorkbenchSighting>([['b', { count: 4, lastSeen: null }]])
    );
    render(<PopularFitsPanel shipTypeId={626} hullName="Vexor" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'EVE Workbench' }));

    expect(useWorkbenchSightingsMock).toHaveBeenLastCalledWith(626, FITS);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).not.toMatch(/Seen on zKillboard/);
    expect(rows[1].textContent).toMatch(/Seen on zKillboard: 4 recent losses/);
  });
});
