import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { AssumedCustomsNote } from './AssumedCustomsNote';
import { assumedCustomsNames } from './colonyCustoms';

describe('AssumedCustomsNote', () => {
  it('says the assumed rate, names the colonies, and links to Plan', () => {
    render(
      <MemoryRouter>
        <AssumedCustomsNote names={['Hek VIII', 'Lustrevik III']} />
      </MemoryRouter>
    );
    expect(screen.getByText(/assume 10% customs on Hek VIII, Lustrevik III/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Set the rate on Plan' }).getAttribute('href')).toBe(
      '/planetary-industry/plan'
    );
  });

  it('renders nothing when no figure is assumed', () => {
    const { container } = render(
      <MemoryRouter>
        <AssumedCustomsNote names={[]} />
      </MemoryRouter>
    );
    expect(container.textContent).toBe('');
  });

  it('picks only assumed colonies, falling back to a label for an unnamed one', () => {
    expect(
      assumedCustomsNames(
        [
          { planetId: 1, name: 'A', taxAssumed: true },
          { planetId: 2, name: 'B', taxAssumed: false },
          { planetId: 3, name: null, taxAssumed: true },
        ],
        (id) => `Planet ${id}`
      )
    ).toEqual(['A', 'Planet 3']);
  });
});
