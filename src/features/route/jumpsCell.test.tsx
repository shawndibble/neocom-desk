import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { renderJumpsCell } from './jumpsCell';

describe('renderJumpsCell', () => {
  it('names the count link so a screen reader hears what it opens', () => {
    const t = i18n.t.bind(i18n);
    render(
      <MemoryRouter>{renderJumpsCell({ kind: 'value', count: 5 }, t, 'x', 30000142)}</MemoryRouter>
    );
    expect(screen.getByRole('link')).toHaveAccessibleName('5 jumps — open route safety');
  });

  it('is plain text with no system to route to', () => {
    const t = i18n.t.bind(i18n);
    render(
      <MemoryRouter>{renderJumpsCell({ kind: 'value', count: 1 }, t, 'x', null)}</MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
