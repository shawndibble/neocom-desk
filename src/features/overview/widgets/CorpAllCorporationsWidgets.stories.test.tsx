import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../../../../.storybook/preview';
import * as stories from './CorpAllCorporationsWidgets.stories';

setProjectAnnotations(preview.default);
const { CustomsOffices, Starbases, Sovereignty, Contracts, MarketOrders, PartlyFailed } =
  composeStories(stories);

describe('Corp widgets on All my corporations', () => {
  it.each([
    ['Customs offices', CustomsOffices],
    ['Starbases', Starbases],
    ['Sovereignty', Sovereignty],
    ['Contracts', Contracts],
    ['Market orders', MarketOrders],
  ])('%s names each row’s corporation', (_name, Story) => {
    render(<Story />);
    expect(screen.getByRole('columnheader', { name: 'Corporation' })).toBeInTheDocument();
    expect(screen.getAllByText('ASHV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ASHH').length).toBeGreaterThan(0);
  });

  it('keeps the other corporations’ rows when one read failed', () => {
    render(<PartlyFailed />);
    expect(screen.getAllByRole('row')).toHaveLength(4); // the header and three offices
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });
});
