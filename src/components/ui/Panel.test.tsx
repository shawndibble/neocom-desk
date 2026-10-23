import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
