import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { SplitButtonChevron } from './SplitButtonChevron';

describe('SplitButtonChevron', () => {
  it('is named by its label and opens the menu it triggers', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SplitButtonChevron label="More save options" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Save as new</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await userEvent.click(screen.getByRole('button', { name: 'More save options' }));

    expect(await screen.findByRole('menuitem', { name: 'Save as new' })).toBeInTheDocument();
  });

  it('overrides the size tier padding with an important utility', () => {
    render(<SplitButtonChevron label="More" size="sm" />);
    // A bare `px-1` loses to the tier's `px-2.5` in Tailwind's stylesheet order.
    expect(screen.getByRole('button', { name: 'More' })).toHaveClass('px-1!');
  });
});
