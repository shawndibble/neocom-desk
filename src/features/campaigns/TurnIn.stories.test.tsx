import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../../../.storybook/preview';
import * as breakdownStories from './TurnInBreakdown.stories';
import * as detailStories from './TurnInDetail.stories';

setProjectAnnotations(preview.default);
const detail = composeStories(detailStories);
const breakdown = composeStories(breakdownStories);

describe('turn-in stories', () => {
  it('draws every TurnInDetail variant', () => {
    render(<detail.AllVariants />);
    expect(screen.getAllByText('Kestrel Vane pressed Participate').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Not signed up: press Participate now in the Opportunities window')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mira Solenne: Military Campaigns not granted' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Kestrel Vane: Autopilot waypoints not granted' })
    ).toBeInTheDocument();
    expect(screen.getByText('28,000 ISK + 40 LP (LP unpriced)')).toBeInTheDocument();
  });

  it.each(Object.entries(breakdown))('draws the %s breakdown', (_name, Story) => {
    render(<Story />);
    expect(screen.getByRole('dialog', { name: 'Turn in: 39.6M' })).toBeInTheDocument();
  });
});
