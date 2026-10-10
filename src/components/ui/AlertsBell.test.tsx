import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { AlertsBell } from './AlertsBell';
import { UnreadAlertsContext } from './unreadAlertsContext';

function renderBell(count: number) {
  return render(
    <MemoryRouter>
      <UnreadAlertsContext.Provider value={count}>
        <AlertsBell />
      </UnreadAlertsContext.Provider>
    </MemoryRouter>
  );
}

describe('AlertsBell', () => {
  it('links to the Alerts page and shows the unread count', () => {
    renderBell(3);
    const link = screen.getByRole('link', { name: 'Alerts, 3 waiting' });
    expect(link).toHaveAttribute('href', '/alerts');
    expect(link).toHaveTextContent('3');
  });

  it('is absent from the DOM with no alerts', () => {
    const { container } = renderBell(0);
    expect(container).toBeEmptyDOMElement();
  });
});
