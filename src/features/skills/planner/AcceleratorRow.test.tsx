import { HOUR_MS } from '@/lib/age';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { AcceleratorRow } from './AcceleratorRow';

const NOW = Date.UTC(2026, 10, 14, 12);

function renderRow(props: Partial<Parameters<typeof AcceleratorRow>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AcceleratorRow
        characterId={1}
        running={null}
        detectedBonus={null}
        nowMs={NOW}
        attributes={<span>INT 38</span>}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('AcceleratorRow', () => {
  it('says None when nothing is injected, and its sheet opens on the editor', async () => {
    renderRow();
    await userEvent.click(screen.getByRole('button', { name: /^Attributes\s*Accelerator · None/ }));
    const sheet = screen.getByRole('dialog', { name: 'Accelerator' });
    expect(sheet).toHaveTextContent('Time left');
    expect(sheet).toHaveTextContent('INT 38');
  });

  it('asks for the time left when the bonus was only detected', () => {
    renderRow({ detectedBonus: 13 });
    expect(screen.getByRole('button', { name: /\+13 detected · set time left/ })).toBeVisible();
  });

  it('counts down a typed-in accelerator', () => {
    renderRow({
      detectedBonus: 13,
      running: {
        id: '1',
        characterId: 1,
        bonus: 13,
        expiresAt: NOW + 26 * HOUR_MS,
        updatedAt: NOW,
      },
    });
    expect(screen.getByRole('button', { name: /\+13 · 1d 2h left/ })).toBeVisible();
  });
});
