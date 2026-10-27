import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { nothingPriced, type EntryValuation } from '@/engine/miningTax/yieldValuation';
import { UnpricedIsk } from './UnpricedIsk';

function valuation(over: Partial<EntryValuation>): EntryValuation {
  return {
    rawValue: 0,
    refineValue: 0,
    pricedAll: false,
    efficiency: 0.5,
    implantBonusPct: 0,
    lines: [],
    ...over,
  } as EntryValuation;
}

describe('UnpricedIsk (#3095)', () => {
  it('prints an em dash when nothing is priced', () => {
    const v = valuation({});
    expect(nothingPriced(v)).toBe(true);
    render(<UnpricedIsk valuation={v} value={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('keeps a partly priced day figure', () => {
    const v = valuation({ rawValue: 1500 });
    expect(nothingPriced(v)).toBe(false);
    render(<UnpricedIsk valuation={v} value={1500} />);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.getByText(/1,500/)).toBeInTheDocument();
  });

  it('keeps a genuine zero on a fully priced day', () => {
    expect(nothingPriced(valuation({ pricedAll: true }))).toBe(false);
  });
});
