import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Well } from './Well';

describe('Well', () => {
  it('is a bordered panel-2 box at 8px by default', () => {
    render(<Well>Note</Well>);
    const c = screen.getByText('Note').className;
    for (const k of ['rounded-xs', 'border', 'border-line', 'bg-panel-2', 'p-2']) {
      expect(c).toContain(k);
    }
  });

  it.each([
    ['sm', 'p-2'],
    ['md', 'p-2.5'],
    ['lg', 'p-3'],
    ['flat', 'px-3'],
  ] as const)('size %s pads %s', (size, cls) => {
    render(<Well size={size}>Note</Well>);
    expect(screen.getByText('Note').className.split(' ')).toContain(cls);
  });

  it.each([
    ['accent', 'border-accent-dim', 'bg-accent/10'],
    ['warning', 'border-warning/60', 'bg-warning/10'],
    ['danger', 'border-danger/60', 'bg-danger/10'],
  ] as const)('tone %s swaps the edge and fill', (tone, border, fill) => {
    render(<Well tone={tone}>Note</Well>);
    const c = screen.getByText('Note').className.split(' ');
    expect(c).toEqual(expect.arrayContaining([border, fill]));
    expect(c).not.toContain('border-line');
    expect(c).not.toContain('bg-panel-2');
  });

  it('renders the requested element and appends layout classes', () => {
    render(
      <Well as="p" className="space-y-1">
        Note
      </Well>
    );
    const el = screen.getByText('Note');
    expect(el.tagName).toBe('P');
    expect(el.className).toContain('space-y-1');
  });
});
