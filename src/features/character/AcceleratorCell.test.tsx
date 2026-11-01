import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { AcceleratorCell } from './AcceleratorCell';

vi.mock('@/sync', () => ({ scheduleSync: vi.fn() }));

const HOUR = 3_600_000;

function renderCell(
  record?: { bonus: number; expiresAt: number },
  detectedBonus: number | null = null
) {
  return render(
    <AcceleratorCell
      characterId={7}
      name="Pilot Seven"
      record={record && { id: '7', characterId: 7, updatedAt: 0, ...record }}
      detectedBonus={detectedBonus}
      timeZone={undefined}
    />
  );
}

beforeEach(async () => {
  await db.characterAccelerators.clear();
});

describe('AcceleratorCell', () => {
  it('shows the bonus and a countdown for an accelerator the pilot typed in', () => {
    renderCell({ bonus: 12, expiresAt: Date.now() + 5 * HOUR + 30 * 60_000 });
    expect(screen.getByText(/^\+12 · 5h/)).toBeInTheDocument();
  });

  it('shows the bonus alone, with no countdown, for one only guessed from the attribute sheet', () => {
    renderCell(undefined, 12);
    expect(screen.getByText('+12')).toBeInTheDocument();
  });

  it('says No with nothing typed in and nothing detected, and for one that has run out', () => {
    const { unmount } = renderCell();
    expect(screen.getByText('No')).toBeInTheDocument();
    unmount();
    renderCell({ bonus: 12, expiresAt: Date.now() - 1_000 });
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('always offers the pencil, and saving a quick pick stores the accelerator', async () => {
    const user = userEvent.setup();
    renderCell(undefined, 12);
    await user.click(screen.getByRole('button', { name: 'Edit accelerator for Pilot Seven' }));
    // The bonus is prefilled from detection.
    expect(await screen.findByRole('spinbutton')).toHaveValue(12);
    await user.click(screen.getByRole('button', { name: /^24\s?h|1 ?d/i }));
    await waitFor(async () => {
      const row = await db.characterAccelerators.get('7');
      expect(row?.bonus).toBe(12);
      expect(row?.expiresAt).toBeGreaterThan(Date.now() + 23 * HOUR);
    });
  });
});
