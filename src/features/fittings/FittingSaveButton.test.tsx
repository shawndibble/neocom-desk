import { describe, expect, it, vi } from 'vitest';
import { render as renderBare, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { FittingSaveButton } from './FittingSaveButton';

/** The Save to EVE item navigates, so the button needs a router. */
const render = (ui: ReactElement) => renderBare(ui, { wrapper: MemoryRouter });

function setup(canSave: boolean, onSave = vi.fn()) {
  render(
    <FittingSaveButton
      onSave={onSave}
      canSave={canSave}
      saveBlockedReason="Nothing to save yet"
      updating={false}
      onSaveAsNew={vi.fn()}
      onSaveToEve={vi.fn()}
      canSaveToEve={false}
    />
  );
  return onSave;
}

describe('FittingSaveButton', () => {
  it('blocks with aria-disabled, so the reason stays in a tooltip', async () => {
    const user = userEvent.setup();
    const onSave = setup(false);
    const save = screen.getByRole('button', { name: 'Save to My Fittings' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toHaveAttribute('title');
    await user.hover(save);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Nothing to save yet');
    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves when it can', async () => {
    const user = userEvent.setup();
    const onSave = setup(true);
    await user.click(screen.getByRole('button', { name: 'Save to My Fittings' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  describe('keyboard chords', () => {
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
      document.dispatchEvent(event);
      return event;
    };

    it('Ctrl+S saves and keeps the browser from saving the page', () => {
      const onSave = setup(true);
      const event = press({ key: 's', ctrlKey: true });
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('Ctrl+S with Save off still blocks the browser, and saves nothing', () => {
      const onSave = setup(false);
      const event = press({ key: 's', ctrlKey: true });
      expect(onSave).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('Ctrl+Shift+S saves a copy only once there is an original to keep', () => {
      const onSaveAsNew = vi.fn();
      const { rerender } = render(
        <FittingSaveButton
          onSave={vi.fn()}
          canSave
          updating={false}
          onSaveAsNew={onSaveAsNew}
          onSaveToEve={vi.fn()}
          canSaveToEve={false}
        />
      );
      press({ key: 'S', ctrlKey: true, shiftKey: true });
      expect(onSaveAsNew).not.toHaveBeenCalled();
      rerender(
        <FittingSaveButton
          onSave={vi.fn()}
          canSave
          updating
          onSaveAsNew={onSaveAsNew}
          onSaveToEve={vi.fn()}
          canSaveToEve={false}
        />
      );
      press({ key: 'S', ctrlKey: true, shiftKey: true });
      expect(onSaveAsNew).toHaveBeenCalledTimes(1);
    });

    it('names its chord for assistive tech', () => {
      setup(true);
      expect(screen.getByRole('button', { name: 'Save to My Fittings' })).toHaveAttribute(
        'aria-keyshortcuts',
        'Control+S'
      );
    });
  });

  describe('naming where it saves', () => {
    it('reads "Save", names My Fittings, and lists every destination in the caret', async () => {
      const user = userEvent.setup();
      setup(true);
      expect(screen.getByRole('button', { name: 'Save to My Fittings' })).toHaveTextContent(
        /^Save$/
      );
      await user.click(screen.getByRole('button', { name: 'More save options' }));
      expect(await screen.findByRole('menuitem', { name: /^Save to My Fittings/ })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'Save to EVE' })).toBeTruthy();
      // No copy to make of a Fitting that was never saved.
      expect(screen.queryByRole('menuitem', { name: /Save as new/ })).toBeNull();
    });

    it('names the destination in its accessible name and tooltip', async () => {
      const user = userEvent.setup();
      render(
        <FittingSaveButton
          onSave={vi.fn()}
          canSave
          updating={false}
          onSaveAsNew={vi.fn()}
          onSaveToEve={vi.fn()}
          canSaveToEve={false}
        />
      );
      const save = screen.getByRole('button', { name: 'Save to My Fittings' });
      expect(save).toHaveTextContent(/^Save$/);
      await user.hover(save);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Save to My Fittings');
    });

    it('says Update once saved, and still names My Fittings', async () => {
      const user = userEvent.setup();
      render(
        <FittingSaveButton
          onSave={vi.fn()}
          canSave
          updating
          onSaveAsNew={vi.fn()}
          onSaveToEve={vi.fn()}
          canSaveToEve={false}
        />
      );
      expect(screen.getByRole('button', { name: 'Update in My Fittings' })).toHaveTextContent(
        /^Update$/
      );
      await user.click(screen.getByRole('button', { name: 'More save options' }));
      expect(await screen.findByRole('menuitem', { name: /^Update in My Fittings/ })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /Save as new/ })).toBeTruthy();
    });
  });
});
