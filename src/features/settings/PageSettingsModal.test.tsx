import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { PageSettingsButton } from './PageSettingsModal';

describe('PageSettingsButton', () => {
  it("opens the page's settings in a modal, with a way through to the full section", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PageSettingsButton pageName="Industry" section="industry">
          <p>the industry form</p>
        </PageSettingsButton>
      </MemoryRouter>
    );

    expect(screen.queryByText('the industry form')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Industry settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Industry settings' });
    expect(dialog).toHaveTextContent('the industry form');
    expect(screen.getByRole('link', { name: 'All settings' })).toHaveAttribute(
      'href',
      '/settings/industry'
    );

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
