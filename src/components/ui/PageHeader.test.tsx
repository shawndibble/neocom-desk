import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as the route heading', () => {
    render(<PageHeader title="Wallet" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Wallet' })).toBeInTheDocument();
  });

  it('renders meta beside the title and actions after it', () => {
    render(
      <PageHeader
        title="Assets"
        meta={<span>12m ago</span>}
        actions={<button type="button">Refresh</button>}
      />
    );
    expect(screen.getByText('12m ago')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('always draws the alerts bell in the actions cluster, even with no controls', () => {
    render(<PageHeader title="Settings" />);
    // Dim at zero, but there: the corner does not shift when the first alert arrives.
    expect(screen.getByRole('button', { name: 'Alerts, none waiting' })).toBeInTheDocument();
  });
});
