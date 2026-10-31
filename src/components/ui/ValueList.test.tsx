import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ValueList, ValueRow } from './ValueList';

describe('ValueList', () => {
  it('pairs each label with its value, with an optional aside', () => {
    render(
      <ValueList>
        <ValueRow label="Fine" note="3 orders" value="1M" />
        <ValueRow label="Needs you" value="400K" tone="warning" />
      </ValueList>
    );
    const term = screen.getByText('Fine').closest('dt') as HTMLElement;
    expect(within(term).getByText('3 orders')).toBeInTheDocument();
    expect(screen.getByText('1M').tagName).toBe('DD');
    expect(screen.getByText('400K')).toHaveClass('tabular-nums');
  });

  it('draws hairlines only in the divided variant', () => {
    const { container, rerender } = render(
      <ValueList>
        <ValueRow label="A" value="1" />
      </ValueList>
    );
    expect(container.querySelector('dl')).toHaveClass('divide-y');
    rerender(
      <ValueList variant="plain">
        <ValueRow label="A" value="1" />
      </ValueList>
    );
    expect(container.querySelector('dl')).not.toHaveClass('divide-y');
  });
});
