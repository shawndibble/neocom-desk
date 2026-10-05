import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    </MemoryRouter>
  );
}

describe('ItemRow name', () => {
  it('links the name to the item in Market', () => {
    renderItemRow({ typeId: 11 });
    const link = screen.getByRole('link', { name: 'Rifter Blueprint' });
    expect(link.getAttribute('href')).toMatch(/^\/market\/browser\?.*11/);
    expect(link).not.toHaveAttribute('title');
  });

  it('stays live in select mode, where only the checkbox selects', async () => {
    const onToggleSelection = vi.fn();
    renderItemRow({ typeId: 11, onToggleSelection, selectMode: true });
    await userEvent.click(screen.getByRole('link', { name: 'Rifter Blueprint' }));
    expect(onToggleSelection).not.toHaveBeenCalled();
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
