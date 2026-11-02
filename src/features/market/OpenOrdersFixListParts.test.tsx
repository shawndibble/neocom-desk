import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { FixListSummary } from './OpenOrdersFixListParts';

const base = { actCount: 2, actIskTiedUp: 210_000_000, watchCount: 3, fineCount: 7 };

describe('FixListSummary', () => {
  it('says nothing about the matching set while no funnel filter narrows', () => {
    render(<FixListSummary {...base} />);
    expect(screen.queryByText(/matching/)).toBeNull();
  });

  it('adds the ISK across every matching order while a filter narrows, beside the Needs you figure', () => {
    render(<FixListSummary {...base} matching={{ count: 12, iskTiedUp: 1_900_000_000 }} />);
    expect(screen.getByText(/ISK tied up in them/)).toBeInTheDocument();
    expect(screen.getByText(/ISK across all 12 matching/)).toBeInTheDocument();
  });

  it('reads a single matching order in the singular', () => {
    render(<FixListSummary {...base} matching={{ count: 1, iskTiedUp: 5_000_000 }} />);
    expect(screen.getByText(/ISK in the matching order/)).toBeInTheDocument();
  });

  it('adds nothing when the filter matches no order', () => {
    render(<FixListSummary {...base} matching={{ count: 0, iskTiedUp: 0 }} />);
    expect(screen.queryByText(/matching/)).toBeNull();
  });
});
