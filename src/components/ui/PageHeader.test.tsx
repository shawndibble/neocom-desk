import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('omits the actions cluster entirely when a route has no controls', () => {
    const { container } = render(<PageHeader title="Settings" />);
    expect(container.querySelector('header')?.children).toHaveLength(1);
  });
});
