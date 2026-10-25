import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import '@/i18n';
import { DepthPriceLine } from './DepthPriceLine';

const depth = (best: number, avg: number): DepthPrice => ({
  best,
  avg,
  need: 1,
  filled: 1,
  listed: 5,
  covered: true,
  levels: [],
});

describe('DepthPriceLine', () => {
  it('shortens a large price, so a blueprint row does not grow', () => {
    render(<DepthPriceLine depth={depth(1_492_000_000, 1_492_000_000)} />);
    expect(screen.getByText('1.5B best · 1.5B avg for 1')).toBeInTheDocument();
  });

  it('keeps cents on a cheap price, where they are the difference', () => {
    render(<DepthPriceLine depth={depth(4.12, 4.31)} />);
    expect(screen.getByText('4.12 best · 4.31 avg for 1')).toBeInTheDocument();
  });
});
