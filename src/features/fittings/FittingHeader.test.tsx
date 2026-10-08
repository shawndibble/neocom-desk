import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { FittingHeader } from './FittingHeader';

vi.mock('./fittingStatsText', () => ({ fittingStatsText: () => 'STATS TEXT' }));
// The Mastery sheet loads SDE data and a plan editor; the header only needs to know it exists.
vi.mock('./MasteryChip', () => ({
  MasteryChip: ({
    presentation,
    onAvailable,
  }: {
    presentation?: string;
    onAvailable?: (v: boolean) => void;
  }) => {
    if (presentation === 'dialog') onAvailable?.(true);
    return presentation === 'dialog' ? null : <button type="button">Mastery</button>;
  },
}));

const fitting: Fitting = { name: 'Test', shipTypeId: 1, modules: [], drones: [], cargo: [] };

function renderHeader(props: Partial<ComponentProps<typeof FittingHeader>> = {}) {
  return render(
    <MemoryRouter>
      <FittingHeader
        fitting={fitting}
        subtitle=""
        onLibrary={vi.fn()}
        onCompare={vi.fn()}
        onRename={vi.fn()}
        price={null}
        stats={{} as FittingStats}
        badges={{
          alpha: { blockers: [], skillName: (id) => `#${id}` },
          mastery: { hullTypeId: 1, hullName: 'Test', characterId: 1 },
        }}
        save={<button type="button">Save to My Fittings</button>}
        {...props}
      />
    </MemoryRouter>
  );
}

afterEach(() => configureClipboard(null));

describe('FittingHeader on desktop', () => {
  it('keeps the badges in the header and Compare and Copy stats in a ⋮ menu', async () => {
    const onCompare = vi.fn();
    renderHeader({ onCompare });
    expect(screen.getByRole('button', { name: 'Alpha OK' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mastery' })).toBeTruthy();
    // Not loose buttons any more.
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy stats' })).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fitting actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Compare' }));
    expect(onCompare).toHaveBeenCalledOnce();
  });

  it('copies the headline stats from the ⋮ menu and says so', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Fitting actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy stats' }));
    expect(written).toEqual(['STATS TEXT']);
    expect(await screen.findByText('Stats copied')).toBeTruthy();
  });

  it('gives Fittings and Export the quiet look, leaving Save the one primary', () => {
    renderHeader();
    for (const name of ['Fittings', 'Export']) {
      expect(screen.getByRole('button', { name }).className).not.toMatch(/bg-accent\b/);
    }
  });
});

describe('FittingHeader below desktop', () => {
  it('folds the badges into the ⋮ menu as text and out of the header row', async () => {
    const user = userEvent.setup();
    renderHeader({ compact: true });
    expect(screen.queryByRole('button', { name: 'Alpha OK' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mastery' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Fitting actions' }));
    expect(await screen.findByText('Alpha OK')).toBeTruthy();
    expect(
      screen.getByText('By skill caps: an Alpha clone can train every skill this fit needs.')
    ).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Mastery skills…' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Compare' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Copy stats' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Rename fitting' })).toBeTruthy();
  });
});
