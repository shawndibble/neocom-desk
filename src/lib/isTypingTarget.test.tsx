import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './shortcuts';

describe('isTypingTarget', () => {
  it('treats a Select trigger (button role=combobox) as typing', () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('role', 'combobox');
    expect(isTypingTarget(trigger)).toBe(true);
  });

  it('treats a node inside a listbox as typing', () => {
    const list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    const option = document.createElement('span');
    list.append(option);
    expect(isTypingTarget(option)).toBe(true);
  });

  it('leaves a plain button alone', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });
});
