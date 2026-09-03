import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

function Harness() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button">Details</button>
      </PopoverTrigger>
      <PopoverContent aria-label="Details">
        <p>Two stacks in Jita</p>
      </PopoverContent>
    </Popover>
  );
}

describe('Popover', () => {
  it('reveals its content as a dialog, not a menu', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByRole('dialog', { name: 'Details' })).toHaveTextContent('Two stacks in Jita');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Details' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
