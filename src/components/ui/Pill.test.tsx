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
    ['accent', 'bg-accent/15 text-accent'],
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

  it('outlined: fixed height, border and tone edge instead of a flat fill', () => {
    render(
      <Pill outlined tone="warning">
        Estimate
      </Pill>
    );
    const c = screen.getByText('Estimate').className;
    for (const k of ['h-[1.125rem]', 'shrink-0', 'border', 'border-warning/45', 'bg-warning/10'])
      expect(c).toContain(k);
    expect(c).not.toContain('py-0.5');
  });

  it('outlined neutral uses the bright line with no fill', () => {
    render(<Pill outlined>Rebuild</Pill>);
    const c = screen.getByText('Rebuild').className;
    expect(c).toContain('border-line-bright');
    expect(c).not.toContain('bg-panel-2');
  });
});
