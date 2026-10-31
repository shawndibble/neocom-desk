import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../../.storybook/preview';
import { unexpectedRequests, whenFetchQuiet } from '@/storybook/fixtureFetch';
import * as routeChunks from '@/app/routeChunks';
import * as stories from './Wallet.stories';

setProjectAnnotations(preview.default);
const { Balance } = composeStories(stories);

describe('Wallet › Balance page story', () => {
  beforeAll(async () => {
    // Pays the cold lazy-chunk compile once, under the hook's own budget.
    await Promise.all([routeChunks.loadLayout(), routeChunks.loadWallet()]);
    const { unmount } = render(<Balance />);
    await screen.findByText('EverMarks', {}, { timeout: 25_000 });
    unmount();
  }, 30_000);

  it('shows the real shell around the real page, from fixtures alone', async () => {
    render(<Balance />);
    expect(await screen.findByText('EverMarks', {}, { timeout: 6_000 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /primary|main/i })).toBeInTheDocument();
    expect(screen.getAllByText('Kestrel Vane').length).toBeGreaterThan(0);
    // The per-corporation loyalty list is the LP Store tab's, not Balance's.
    expect(screen.queryByText('Caldari Navy')).not.toBeInTheDocument();
    // The net worth view fans out to the whole roster; wait for the requests
    // to stop before asking whether any had no fixture.
    await whenFetchQuiet();
    expect(unexpectedRequests()).toEqual([]);
  });
});
