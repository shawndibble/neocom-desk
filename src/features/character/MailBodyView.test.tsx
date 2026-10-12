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
});
