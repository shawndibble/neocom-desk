import { afterEach, describe, expect, it } from 'vitest';
import { installInputModality } from './inputModality';

describe('installInputModality', () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => uninstall?.());

  it('reads keyboard after a navigation key and pointer after the mouse moves', () => {
    uninstall = installInputModality();
    const html = document.documentElement;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(html.dataset.input).toBe('keyboard');
    document.dispatchEvent(new Event('pointermove'));
    expect(html.dataset.input).toBe('pointer');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(html.dataset.input).toBe('keyboard');
    document.dispatchEvent(new Event('pointerdown'));
    expect(html.dataset.input).toBe('pointer');
  });

  it('ignores typing keys', () => {
    uninstall = installInputModality();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(document.documentElement.dataset.input).toBeUndefined();
  });
});
