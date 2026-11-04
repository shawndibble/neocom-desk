import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { PlaceCell } from './sectionParts';
import { isRefineryPlaceholder, refineryPlaceholder, refineryUnreadable } from './moonsFormat';

function renderCell(props: { undockable?: boolean }) {
  return render(
    <MemoryRouter>
      <PlaceCell refinery="Efa - Brass Anvil" moon="Efa I - Moon 3" {...props} />
    </MemoryRouter>
  );
}

describe('PlaceCell undockable chip', () => {
  it('shows a chip after the station name when the viewer cannot dock', () => {
    renderCell({ undockable: true });

    expect(screen.getByText('Undockable')).toBeInTheDocument();
    expect(screen.getByText(/Brass Anvil/)).toBeInTheDocument();
  });

  it('shows no chip by default', () => {
    renderCell({});

    expect(screen.queryByText('Undockable')).not.toBeInTheDocument();
  });
});

describe('refinery stand-ins', () => {
  it('recognises both and never a real name', () => {
    expect(isRefineryPlaceholder(refineryPlaceholder(7), 7)).toBe(true);
    expect(isRefineryPlaceholder(refineryUnreadable(7), 7)).toBe(true);
    expect(refineryUnreadable(7)).toBe('Unknown/Undockable (7)');
    expect(isRefineryPlaceholder('Efa - Brass Anvil', 7)).toBe(false);
  });
});
