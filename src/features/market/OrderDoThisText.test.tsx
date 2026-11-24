import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { openOrderRow } from './__fixtures__/openOrderRow';
import { OrderDoThisText } from './OrderDoThisText';

const turnInRow = openOrderRow({
  typeName: 'Shield Failover Report',
  price: 57_990,
  problem: 'turnInPays',
  problems: ['turnInPays'],
  turnInEach: 60_000,
});

describe('OrderDoThisText — Turn in instead (#6708)', () => {
  it('opens the order turn-in from a dashed figure, never reaching the row', async () => {
    const onOpenTurnIn = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <OrderDoThisText row={turnInRow} onOpenTurnIn={onOpenTurnIn} />
      </div>
    );
    await userEvent.click(screen.getByRole('button', { name: /Turn in instead/ }));
    expect(onOpenTurnIn).toHaveBeenCalledWith(turnInRow);
    expect(onRow).not.toHaveBeenCalled();
  });

  it('is plain text inside a phone card', () => {
    render(<OrderDoThisText row={turnInRow} interactive={false} onOpenTurnIn={vi.fn()} />);
    expect(screen.getByText('Turn in instead')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
