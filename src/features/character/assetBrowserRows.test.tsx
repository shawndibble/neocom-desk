import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ItemRow, SearchResultRow } from './assetBrowserRows';

function renderRow(unitVolume: number | undefined) {
  render(
    <ItemRow
      name="Test Item"
      quantity={4000}
      unitVolume={unitVolume}
      estimatedValue={1000}
      characterBadge={null}
      wrap={(children) => children}
      selectMode={false}
      selectionState="unchecked"
      onToggleSelection={vi.fn()}
      t={(key) => (key === 'assets.unknownValue' ? '—' : key)}
    />
  );
}

describe('ItemRow volume', () => {
  it('prints a small volume with precision and its unit', () => {
    renderRow(0.01);
    expect(screen.getByText('0.01 m³')).toBeInTheDocument();
  });

  it('prints a large volume thousands-separated with its unit', () => {
    renderRow(470000);
    expect(screen.getByText('470,000 m³')).toBeInTheDocument();
  });

  it('keeps the unknown placeholder when the volume is unknown', () => {
    renderRow(undefined);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="loc">{`${pathname}${search}`}</output>;
}

function renderItemRow(overrides: Partial<Parameters<typeof ItemRow>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ItemRow
        name="Rifter Blueprint"
        quantity={1}
        unitVolume={0.01}
        estimatedValue={1000}
        characterBadge={null}
        wrap={(children) => children}
        selectMode={false}
        selectionState="unchecked"
        onToggleSelection={vi.fn()}
        t={(key) => key}
        {...overrides}
      />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('ItemRow name', () => {
  it('links the name to the item Show info', () => {
    renderItemRow({ typeId: 11 });
    const link = screen.getByRole('link', { name: 'Rifter Blueprint' });
    expect(link.getAttribute('href')).toMatch(/\?info=type-11$/);
    expect(link).not.toHaveAttribute('title');
  });

  // §6c: the name stays a real link in select mode; only the checkbox selects.
  it('still navigates in select mode, where only the checkbox selects', async () => {
    const onToggleSelection = vi.fn();
    renderItemRow({ typeId: 11, onToggleSelection, selectMode: true });
    await userEvent.click(screen.getByRole('link', { name: 'Rifter Blueprint' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('?info=type-11');
    expect(onToggleSelection).not.toHaveBeenCalled();
  });

  it('does not follow the name from the click that ends a press which opened the row menu', () => {
    renderItemRow({ typeId: 11 });
    const link = screen.getByRole('link', { name: 'Rifter Blueprint' });
    fireEvent.pointerDown(link, { pointerType: 'touch' });
    fireEvent.contextMenu(link);
    fireEvent.click(link, { detail: 1 });
    expect(screen.getByTestId('loc')).toHaveTextContent('/');
    expect(screen.getByTestId('loc')).not.toHaveTextContent('info=');

    // The next ordinary tap still follows it.
    fireEvent.pointerDown(link, { pointerType: 'touch' });
    fireEvent.click(link, { detail: 1 });
    expect(screen.getByTestId('loc')).toHaveTextContent('?info=type-11');
  });

  it('does not follow the name when a touch is held past the long-press delay', () => {
    vi.useFakeTimers();
    try {
      renderItemRow({ typeId: 11 });
      const link = screen.getByRole('link', { name: 'Rifter Blueprint' });
      fireEvent.pointerDown(link, { pointerType: 'touch' });
      vi.advanceTimersByTime(800);
      fireEvent.click(link, { detail: 1 });
      expect(screen.getByTestId('loc')).not.toHaveTextContent('info=');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives the name a 44px touch target, back to its pointer size at md+', () => {
    renderItemRow({ typeId: 11 });
    expect(screen.getByRole('link', { name: 'Rifter Blueprint' })).toHaveClass(
      'min-h-11',
      'md:min-h-7'
    );
  });

  it('keeps the name plain text without a type id', () => {
    renderItemRow();
    expect(screen.queryByRole('link', { name: 'Rifter Blueprint' })).toBeNull();
    expect(screen.getByText('Rifter Blueprint')).toBeInTheDocument();
  });
});

describe('blueprint badge', () => {
  it('marks an original as BPO', () => {
    renderItemRow({ blueprintKind: 'original', typeId: 11 });
    expect(screen.getByText('assets.blueprintBadge.original.label')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByText('assets.blueprintBadge.original.name')).toHaveClass('sr-only');
    // The badge sits beside the link, so the link's name stays the item's.
    expect(screen.getByRole('link', { name: 'Rifter Blueprint' })).toBeInTheDocument();
  });

  it('marks a copy as BPC', () => {
    renderItemRow({ blueprintKind: 'copy' });
    expect(screen.getByText('assets.blueprintBadge.copy.label')).toBeInTheDocument();
    expect(screen.getByText('assets.blueprintBadge.copy.name')).toHaveClass('sr-only');
    expect(screen.queryByText(/assets\.blueprintBadge\.original/)).toBeNull();
  });

  it('shows no badge on an ordinary item', () => {
    renderItemRow({ name: 'Tritanium' });
    expect(screen.queryByText(/assets\.blueprintBadge/)).toBeNull();
  });

  it('marks a search hit too, keeping the row a link', () => {
    render(
      <MemoryRouter>
        <SearchResultRow
          name="Rifter Blueprint"
          quantity={1}
          estimatedValue={0}
          trail={['Jita IV - Moon 4']}
          security={0.9}
          href="/assets/60003760"
          characterBadge={null}
          blueprintKind="copy"
          t={(key) => key}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('assets.blueprintBadge.copy.label')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/assets/60003760');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
