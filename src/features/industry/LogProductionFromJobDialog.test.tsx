import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { LogProductionFromJobDialog } from './LogProductionFromJobDialog';

function renderDialog(onCreatePlan: () => Promise<string | null>) {
  const onResolved = vi.fn();
  render(
    <LogProductionFromJobDialog
      productName="Rifter"
      matches={[]}
      onCreatePlan={onCreatePlan}
      onResolved={onResolved}
      onClose={vi.fn()}
    />
  );
  return { onResolved };
}

describe('LogProductionFromJobDialog', () => {
  it('shows the failure and frees the button when creating the plan rejects', async () => {
    const onCreatePlan = vi.fn().mockRejectedValue(new Error('catalog unavailable'));
    const { onResolved } = renderDialog(onCreatePlan);
    const create = screen.getAllByRole('button').find((b) => b.textContent?.match(/create/i));
    expect(create).toBeDefined();
    await userEvent.click(create!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/./);
    expect(create).toBeEnabled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
