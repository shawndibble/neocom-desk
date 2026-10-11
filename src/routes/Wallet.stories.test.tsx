import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../../.storybook/preview';
import { unexpectedRequests } from '@/storybook/fixtureFetch';
import * as routeChunks from '@/app/routeChunks';
import * as stories from './Wallet.stories';

setProjectAnnotations(preview.default);
const { Balance } = composeStories(stories);

describe('Wallet › Balance page story', () => {
  beforeAll(async () => {
    // Pays the cold lazy-chunk compile once, under the hook's own budget.
    await Promise.all([routeChunks.loadLayout(), routeChunks.loadWallet()]);
  }, 30_000);

  it('shows the real shell around the real page, from fixtures alone', async () => {
    render(<Balance />);
    expect(await screen.findByText('EverMarks', {}, { timeout: 8_000 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /primary|main/i })).toBeInTheDocument();
    expect(screen.getAllByText('Kestrel Vane').length).toBeGreaterThan(0);
    expect(screen.getByText('Caldari Navy')).toBeInTheDocument();
    // The net worth view fans out to the whole roster; let it finish before
    // asking whether anything reached the network with no fixture.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(unexpectedRequests()).toEqual([]);
  });
});
