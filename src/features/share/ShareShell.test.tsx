import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { ShareShell } from './ShareShell';

beforeEach(async () => {
  await db.characters.clear();
});

describe('ShareShell wide', () => {
  it('keeps brand and login in the header, the ship and action beside the notice, and the footer last', async () => {
    render(
      <MemoryRouter>
        <ShareShell
          title="Shared fitting"
          wide
          footer={<span>Expires soon</span>}
          lead={<span>Heron</span>}
          notice="Shown at every skill level V."
          actions={<button type="button">Copy it</button>}
        >
          <p>body</p>
        </ShareShell>
      </MemoryRouter>
    );

    const header = screen.getByRole('heading', { name: 'Shared fitting' }).closest('header')!;
    expect(await within(header).findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(within(header).queryByText('Expires soon')).not.toBeInTheDocument();
    expect(within(header).queryByRole('button', { name: 'Copy it' })).not.toBeInTheDocument();
    expect(screen.getByText('Heron')).toBeInTheDocument();
    expect(screen.getByText('Shown at every skill level V.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy it' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Expires soon');
  });
});
