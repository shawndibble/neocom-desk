import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutcomeNote } from './OutcomeNote';

describe('OutcomeNote', () => {
  it('raises a toast for a success', () => {
    render(<OutcomeNote outcome={{ tone: 'status', text: 'Opened in your EVE client.' }} />);
    expect(screen.getAllByText('Opened in your EVE client.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a failure inline as an alert', () => {
    render(<OutcomeNote outcome={{ tone: 'alert', text: 'Is your character logged in?' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Is your character logged in?');
  });

  it('renders nothing without an outcome', () => {
    const { container } = render(<OutcomeNote outcome={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
