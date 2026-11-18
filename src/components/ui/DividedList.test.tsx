import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DividedList } from './DividedList';

describe('DividedList', () => {
  it('divides rows inside a bordered panel-2 box', () => {
    render(<DividedList data-testid="l">x</DividedList>);
    const c = screen.getByTestId('l').className;
    for (const k of [
      'divide-y',
      'divide-line',
      'rounded-xs',
      'border',
      'border-line',
      'bg-panel-2',
    ]) {
      expect(c).toContain(k);
    }
  });

  it('switches surface', () => {
    render(
      <>
        <DividedList data-testid="a" surface="panel" />
        <DividedList data-testid="b" surface="none" />
      </>
    );
    expect(screen.getByTestId('a').className.split(' ')).toContain('bg-panel');
    expect(screen.getByTestId('b').className).not.toContain('bg-panel');
  });

  it('renders a ul for li children', () => {
    render(
      <DividedList as="ul" className="mt-1">
        <li>row</li>
      </DividedList>
    );
    const ul = screen.getByRole('list');
    expect(ul.tagName).toBe('UL');
    expect(ul.className).toContain('mt-1');
  });
});
