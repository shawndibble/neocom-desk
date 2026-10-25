import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EditableValue } from './EditableValue';

describe('EditableValue', () => {
  it('names the action before the value, for a screen reader', () => {
    render(
      <EditableValue label="Edit Have for Tritanium" onEdit={() => {}}>
        3,000
      </EditableValue>
    );

    // jsdom trims the space after the comma that a browser keeps.
    expect(screen.getByRole('button', { name: /^Edit Have for Tritanium, ?3,000$/ })).toBeVisible();
  });

  it('opens the field on a click without reaching the row behind it', () => {
    const onEdit = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <EditableValue label="Edit target" onEdit={onEdit}>
          5
        </EditableValue>
      </div>
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onEdit).toHaveBeenCalledWith();
    expect(onRow).not.toHaveBeenCalled();
  });

  it('seeds the field with a digit typed on the value', () => {
    const onEdit = vi.fn();
    render(
      <EditableValue label="Edit target" onEdit={onEdit}>
        5
      </EditableValue>
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: '7' });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith('7');
  });

  it('takes focus as it mounts when asked, then clears the request', () => {
    const onFocused = vi.fn();
    render(
      <EditableValue label="Edit target" onEdit={() => {}} focusOnMount onFocused={onFocused}>
        5
      </EditableValue>
    );

    expect(screen.getByRole('button')).toHaveFocus();
    expect(onFocused).toHaveBeenCalledTimes(1);
  });
});
