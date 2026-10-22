import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { HeaderMoreMenu } from './HeaderMoreMenu';
import { DropdownMenuItem } from './DropdownMenu';

describe('HeaderMoreMenu', () => {
  it('opens a "More actions" menu of its items', async () => {
    const onSelect = vi.fn();
    render(
      <HeaderMoreMenu>
        <DropdownMenuItem onSelect={onSelect}>Ore tags</DropdownMenuItem>
        <DropdownMenuItem>Page settings</DropdownMenuItem>
      </HeaderMoreMenu>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ore tags' }));
    expect(onSelect).toHaveBeenCalled();
  });

  it('draws at the header touch tier, level with a default IconButton', () => {
    render(
      <HeaderMoreMenu>
        <DropdownMenuItem>A</DropdownMenuItem>
      </HeaderMoreMenu>
    );
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveClass(
      'size-11',
      'md:size-9',
      'touch:size-11'
    );
  });

  it('renders nothing when every child is falsy, fragments included', () => {
    const narrow = false;
    const { container } = render(
      <HeaderMoreMenu>
        {narrow && <DropdownMenuItem>Export</DropdownMenuItem>}
        <>{null}</>
      </HeaderMoreMenu>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
