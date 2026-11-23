import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Panel } from './Panel';

describe('Panel', () => {
  it('sets bare meta text in the header type: small and dim, not the page body font', () => {
    render(
      <Panel title="Build" meta="5 open">
        body
      </Panel>
    );
    const group = screen.getByText('5 open').closest('div');
    expect(group?.className).toContain('text-[0.6875rem]');
    expect(group?.className).toContain('text-text-dim');
  });
});

describe('Panel header toggle', () => {
  it('toggles from the title, leaves a button or link in the header alone, and drops an empty folded body', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Panel
        title="Jobs"
        onHeaderToggle={onToggle}
        actions={
          <>
            <button type="button">Act</button>
            <a href="/x">Go</a>
          </>
        }
      >
        {null}
      </Panel>
    );
    fireEvent.click(screen.getByText('Jobs'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Act'));
    fireEvent.click(screen.getByText('Go'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(container.querySelector('section')?.children).toHaveLength(1);
  });
});
