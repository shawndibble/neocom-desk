import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { NewPlanSplitButton } from './NewPlanSplitButton';

vi.mock('@/sync', () => ({ scheduleSync: vi.fn() }));

describe('NewPlanSplitButton', () => {
  it('says why "from your skill queue" is unavailable with an empty queue', async () => {
    render(
      <MemoryRouter>
        <NewPlanSplitButton
          activeCharacterId={7}
          remapInfo={null}
          onOptimizeQueue={vi.fn()}
          queueEmpty
        />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('button', { name: 'More ways to start a plan' }));
    const item = await screen.findByRole('menuitem', { name: /skill queue/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Your skill queue is empty: nothing to optimize.');
  });
});
