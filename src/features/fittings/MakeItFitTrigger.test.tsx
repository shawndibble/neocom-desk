import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { MakeItFitTrigger } from './MakeItFitTrigger';
import { MakeItFitContext } from './makeItFitContext';

describe('MakeItFitTrigger', () => {
  it('renders nothing outside the editor', () => {
    render(<MakeItFitTrigger resource="cpu" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the budget it fixes and opens the dialog for it', () => {
    const open = vi.fn();
    render(
      <MakeItFitContext.Provider value={open}>
        <MakeItFitTrigger resource="powergrid" />
      </MakeItFitContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fix powergrid' }));
    expect(open).toHaveBeenCalledWith('powergrid');
  });
});
