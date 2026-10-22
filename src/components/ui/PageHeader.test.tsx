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

  describe('with a scope picker', () => {
    function renderWithScope() {
      return render(
        <PageHeader
          title="Market orders and history"
          meta={<span>12m ago</span>}
          scope={<button type="button">All characters</button>}
          actions={
            <>
              <button type="button">Export</button>
              <button type="button">Refresh</button>
            </>
          }
        />
      );
    }

    it('renders the picker first in the cluster: scope, actions, then the bell last', () => {
      renderWithScope();
      const names = screen
        .getAllByRole('button')
        .map((b) => b.textContent || b.getAttribute('aria-label'));
      expect(names).toEqual(['All characters', 'Export', 'Refresh', 'Alerts, none waiting']);
    });

    it('locks the title row to one line: the h1 truncates with its full name in title', () => {
      renderWithScope();
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveClass('truncate');
      expect(h1).not.toHaveClass('break-words');
      expect(h1).toHaveAttribute('title', 'Market orders and history');
      const cluster = screen.getByRole('button', { name: 'All characters' }).parentElement;
      expect(cluster).toHaveClass('shrink-0', 'flex-nowrap');
      expect(cluster).not.toHaveClass('flex-wrap');
      expect(screen.getByText('12m ago').parentElement).toHaveClass(
        'min-w-0',
        'overflow-hidden',
        'whitespace-nowrap'
      );
    });

    it('without scope keeps the wrapping header as before', () => {
      render(<PageHeader title="Assets" actions={<button type="button">Refresh</button>} />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveClass('break-words');
      expect(h1).not.toHaveAttribute('title');
      expect(screen.getByRole('button', { name: 'Refresh' }).parentElement).toHaveClass(
        'flex-wrap'
      );
    });
  });
});
