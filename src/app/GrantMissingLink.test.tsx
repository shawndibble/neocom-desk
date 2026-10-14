import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { MemoryRouter } from 'react-router-dom';
import { GrantMissingLink } from './GrantMissingLink';
import { grantMissingPath } from './grantMissingPath';

describe('GrantMissingLink', () => {
  it('links to Settings › Permissions, naming the Permissions to flash', () => {
    render(
      <MemoryRouter>
        <GrantMissingLink groups={['openWindow', 'wallet']} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Grant missing Permissions' })).toHaveAttribute(
      'href',
      '/settings/permissions?grant=openWindow,wallet'
    );
  });

  it('is a text link, never a 44px touch target', () => {
    render(
      <MemoryRouter>
        <GrantMissingLink groups={['openWindow']} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link').className).not.toMatch(/min-h|h-11|size-11/);
  });

  it('drops the query when there is nothing to flag', () => {
    expect(grantMissingPath([])).toBe('/settings/permissions');
  });
});
