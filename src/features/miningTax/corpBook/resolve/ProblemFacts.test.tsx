import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import '@/i18n';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { ProblemFacts } from './ProblemFacts';
import type { ResolveTarget } from './targets';

const row = { state: 'billed', date: '2026-11-06', billed: 1_000_000 } as unknown as BookRowView;

describe('ProblemFacts', () => {
  it('says what a billed day costs once, exact, with one unit', () => {
    const target = {
      problem: { kind: 'billed', corporationId: 1, corpName: 'Bureau', characterId: 7, row },
      hideKey: 'day:1:7:2026-11-06',
    } as unknown as ResolveTarget;
    const { container } = render(<ProblemFacts target={target} />);
    expect(container.textContent).toBe('Its book bills 1,000,000 ISK.');
  });
});
