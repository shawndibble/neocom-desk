import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  it('portals to document.body — not into whatever ancestor renders it', () => {
    const { container } = render(
      <div data-testid="host">
        <Toast message="Copied" />
      </div>
    );
    expect(container.querySelector('[data-testid="host"]')).not.toContainElement(
      screen.getByRole('status')
    );
    expect(document.body).toContainElement(screen.getByRole('status'));
  });

  it('shows the message and, given undo, a working undo link', () => {
    let undone = false;
    render(
      <Toast message="Item removed" undo={{ label: 'Undo', onUndo: () => (undone = true) }} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Item removed');
    screen.getByRole('button', { name: 'Undo' }).click();
    expect(undone).toBe(true);
  });
});
