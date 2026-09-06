import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Modal } from './Modal';

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
  /**
   * `Modal` runs on `showModal()`, so the dialog sits in the browser's top
   * layer with everything outside it inert. A surface portalled to
   * `document.body` — Radix's default — would render behind it and take no
   * clicks; see `portalContainer.ts`.
   */
  it('portals its content inside a Modal, not to the body', async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} title="Order detail">
        <Harness />
      </Modal>
    );

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByRole('dialog', { name: 'Order detail' })).toContainElement(
      screen.getByRole('dialog', { name: 'Details' })
    );
  });

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
