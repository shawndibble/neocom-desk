import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemRow } from './assetBrowserRows';

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
