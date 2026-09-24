import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { DocumentTitleTracker } from './DocumentTitleTracker';

describe('DocumentTitleTracker', () => {
  it('retitles the document when the route changes', async () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <DocumentTitleTracker />
        <Routes>
          <Route path="/overview" element={<Link to="/mail">to mail</Link>} />
          <Route path="/mail" element={<p>mail page</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(document.title).toBe('Overview — Neocom Desk');

    await userEvent.click(screen.getByRole('link', { name: 'to mail' }));

    await waitFor(() => expect(document.title).toBe('Mail — Neocom Desk'));
  });
});
