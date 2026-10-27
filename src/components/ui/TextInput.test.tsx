import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { SearchInput } from './SearchInput';
import { TextInput } from './TextInput';

/** The claim DESIGN.md §3 makes: one `size` value, one height, whatever the control. */
function heightClasses(el: Element): string[] {
  return [...el.classList].filter((c) => /(^|:)h-\d+$/.test(c));
}

describe('TextInput', () => {
  it('types like a plain input and forwards its ref', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    render(<TextInput ref={ref} aria-label="Group name" />);

    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Miners');
    expect(ref.current).toHaveValue('Miners');
  });

  it('matches Button at the same size, at both breakpoints', () => {
    render(
      <>
        <TextInput size="sm" aria-label="sm field" />
        <Button size="sm">sm button</Button>
      </>
    );
    expect(heightClasses(screen.getByRole('textbox', { name: 'sm field' }))).toEqual(
      heightClasses(screen.getByRole('button', { name: 'sm button' }))
    );
  });
});

describe('SearchInput', () => {
  it('is a search field, so it reports role searchbox', () => {
    render(<SearchInput aria-label="Search items" />);
    expect(screen.getByRole('searchbox', { name: 'Search items' })).toBeInTheDocument();
  });

  it('puts layout classes on the wrapper and fills it', () => {
    render(<SearchInput aria-label="Search items" className="flex-1" />);
    const field = screen.getByRole('searchbox');
    expect(field).toHaveClass('w-full');
    expect(field.parentElement).toHaveClass('flex-1');
  });

  it('carries the magnifier, hidden from assistive tech', () => {
    const { container } = render(<SearchInput aria-label="Search items" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    // Phosphor marks its glyphs aria-hidden; the field's own label is the name.
    expect(icon).not.toHaveAccessibleName();
  });
});
