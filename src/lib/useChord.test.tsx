import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useChord } from './useChord';

function Probe(props: { onChord: () => void; enabled?: boolean; shift?: boolean }) {
  useChord('s', props.onChord, { enabled: props.enabled, shift: props.shift });
  return <input aria-label="field" />;
}

describe('useChord', () => {
  it('fires on Ctrl+S, from inside a text field, and blocks the browser default', async () => {
    const onChord = vi.fn();
    const user = userEvent.setup();
    const { getByLabelText } = render(<Probe onChord={onChord} />);
    await user.click(getByLabelText('field'));
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    getByLabelText('field').dispatchEvent(event);
    expect(onChord).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('still blocks the browser default when disabled, but does not run', () => {
    const onChord = vi.fn();
    render(<Probe onChord={onChord} enabled={false} />);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    document.dispatchEvent(event);
    expect(onChord).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not run over an open modal', () => {
    const onChord = vi.fn();
    render(<Probe onChord={onChord} />);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    dialog.remove();
    expect(onChord).not.toHaveBeenCalled();
  });

  it('keeps Ctrl+S and Ctrl+Shift+S apart', () => {
    const plain = vi.fn();
    const shifted = vi.fn();
    function Both() {
      useChord('s', plain);
      useChord('s', shifted, { shift: true });
      return null;
    }
    render(<Both />);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true })
    );
    expect(shifted).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });
});
