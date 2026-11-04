import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ItemDescription } from './ItemDescription';

/** jsdom lays nothing out; stand in a clamped paragraph taller than its box. */
function stubOverflow(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
}

afterEach(() => vi.restoreAllMocks());

describe('ItemDescription', () => {
  it('clamps a long description to two lines with More, and Less folds it back', async () => {
    stubOverflow(120, 32);
    render(<ItemDescription markup="A long tale of a ship." />);
    const text = screen.getByText('A long tale of a ship.');
    expect(text).toHaveClass('line-clamp-2');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(text).not.toHaveClass('line-clamp-2');
    const less = screen.getByRole('button', { name: 'Less' });
    expect(less).toHaveAttribute('aria-expanded', 'true');

    await user.click(less);
    expect(text).toHaveClass('line-clamp-2');
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers no toggle when the text fits in two lines', () => {
    stubOverflow(32, 32);
    render(<ItemDescription markup="Short." />);
    expect(screen.getByText('Short.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the whole text with no toggle when asked (an implant, whose bonuses are in it)', () => {
    stubOverflow(120, 32);
    render(<ItemDescription markup="+5% armor hitpoints." full />);
    expect(screen.getByText('+5% armor hitpoints.')).not.toHaveClass('line-clamp-2');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
