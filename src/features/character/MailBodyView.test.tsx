import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MailBodyView } from './MailBodyView';

describe('MailBodyView', () => {
  it('renders a hand-spaced table as table cells', () => {
    render(<MailBodyView text={'Hi\n\nName     m3      ISK\nOlorf    1,115    9,206\n\nBye'} />);
    expect(screen.getByRole('cell', { name: 'Olorf' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '9,206' })).toHaveClass('text-right');
    expect(screen.getByText('Bye')).toBeInTheDocument();
  });

  it('leaves plain prose as text', () => {
    render(<MailBodyView text="Just a note." />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Just a note.')).toBeInTheDocument();
  });

  it('pads a column the same in every row, whether or not the row is the longest', () => {
    render(<MailBodyView text={'A    B    C    D\nx    1    2    3\ny    4    5'} />);
    // Padding that depends on being the row's last cell shifts a short row's
    // numbers out from under the longer row's in the same column.
    expect(screen.getByRole('cell', { name: '2' }).className).toBe(
      screen.getByRole('cell', { name: '5' }).className
    );
  });
});
