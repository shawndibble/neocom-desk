import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pill } from './Pill';

describe('Pill', () => {
  it('renders neutral by default', () => {
    render(<Pill>Corp</Pill>);
    const el = screen.getByText('Corp');
    expect(el.className).toContain('bg-panel-2');
    expect(el.className).toContain('text-text-dim');
  });

  it.each([
    ['success', 'bg-success/15 text-success'],
    ['warning', 'bg-warning/15 text-warning'],
    ['danger', 'bg-danger/15 text-danger'],
  ] as const)('tints %s', (tone, classes) => {
    render(<Pill tone={tone}>Label</Pill>);
    for (const c of classes.split(' ')) expect(screen.getByText('Label').className).toContain(c);
  });

  it('appends layout classes', () => {
    render(<Pill className="shrink-0">Label</Pill>);
    expect(screen.getByText('Label').className).toContain('shrink-0');
  });
});
