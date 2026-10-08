import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { MakeItFitTrigger } from './MakeItFitTrigger';
import { MakeItFitContext } from './makeItFitContext';

describe('MakeItFitTrigger', () => {
  it('renders nothing outside the editor', () => {
    render(<MakeItFitTrigger />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the dialog from the editor', () => {
    const open = vi.fn();
    render(
      <MakeItFitContext.Provider value={open}>
        <MakeItFitTrigger />
      </MakeItFitContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: /make it fit/i }));
    expect(open).toHaveBeenCalledOnce();
  });
});
