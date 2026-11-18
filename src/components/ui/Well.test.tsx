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
  ] as const)('size %s pads %s', (size, cls) => {
    render(<Well size={size}>Note</Well>);
    expect(screen.getByText('Note').className.split(' ')).toContain(cls);
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
