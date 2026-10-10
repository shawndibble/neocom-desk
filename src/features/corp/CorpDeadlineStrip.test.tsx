import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { DeadlineDay } from '@/engine/corp/deadlines';
import { CorpDeadlineStrip } from './CorpDeadlineStrip';

/** Local-midnight days from Oct 29 2026 (a Thursday), so the strip crosses into November. */
function fortnight(): DeadlineDay[] {
  return Array.from({ length: 14 }, (_, i) => ({
    startMs: new Date(2026, 9, 29 + i).getTime(),
    count: i === 0 ? 2 : 0,
    severity: i === 0 ? 'critical' : null,
  }));
}

describe('CorpDeadlineStrip day labels', () => {
  it('labels each column with a narrow weekday and a day number', () => {
    const { container } = render(<CorpDeadlineStrip days={fortnight()} />);
    const columns = container.querySelectorAll('[role="img"] > div');
    expect(columns).toHaveLength(14);
    const first = columns[0].querySelectorAll('span.truncate');
    expect(first[0]).toHaveTextContent('T');
    expect(first[1]).toHaveTextContent('29');
    expect(columns[3].querySelectorAll('span.truncate')[1]).toHaveTextContent('1');
  });

  it('marks today and still announces it as today', () => {
    const { container } = render(<CorpDeadlineStrip days={fortnight()} />);
    const columns = container.querySelectorAll('[role="img"] > div');
    expect(columns[0]).toHaveAttribute('data-today', 'true');
    expect(columns[1]).not.toHaveAttribute('data-today');
    expect(screen.getByRole('img', { name: /Today, 2 due/ })).toBeInTheDocument();
  });

  it('draws a severity glyph on days with something due and none on empty days', () => {
    const { container } = render(<CorpDeadlineStrip days={fortnight()} />);
    const columns = container.querySelectorAll('[role="img"] > div');
    expect(columns[0].querySelectorAll('svg')).toHaveLength(1);
    expect(columns[1].querySelectorAll('svg')).toHaveLength(0);
  });

  it('shows the glyph in the legend instead of a colour swatch', () => {
    const { container } = render(<CorpDeadlineStrip days={fortnight()} />);
    expect(screen.getByText('Critical').querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.size-2')).toBeNull();
  });

  it('has no month row or footnote', () => {
    const { container } = render(<CorpDeadlineStrip days={fortnight()} />);
    expect(container.querySelector('h3')).toBeNull();
    expect(container.textContent).not.toMatch(/fall(s)? due on or before/);
    expect(container.textContent).not.toContain('Nov');
  });
});
