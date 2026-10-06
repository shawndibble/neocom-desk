// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTranslateGuard } from './translateGuard';

describe('installTranslateGuard', () => {
  const originalRemove = Node.prototype.removeChild;
  const originalInsert = Node.prototype.insertBefore;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    Node.prototype.removeChild = originalRemove;
    Node.prototype.insertBefore = originalInsert;
    vi.restoreAllMocks();
  });

  it('removeChild still removes a real child', () => {
    installTranslateGuard();
    const parent = document.createElement('div');
    const child = parent.appendChild(document.createElement('span'));
    expect(parent.removeChild(child)).toBe(child);
    expect(parent.childNodes).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('removeChild skips a node a translator moved, instead of throwing', () => {
    installTranslateGuard();
    const parent = document.createElement('div');
    const wrapper = document.createElement('font');
    const text = wrapper.appendChild(document.createTextNode('hi'));
    expect(() => parent.removeChild(text)).not.toThrow();
    expect(parent.removeChild(text)).toBe(text);
    expect(text.parentNode).toBe(wrapper);
    expect(warn).toHaveBeenCalled();
  });

  it('insertBefore still inserts before a real reference node', () => {
    installTranslateGuard();
    const parent = document.createElement('div');
    const ref = parent.appendChild(document.createElement('b'));
    const fresh = document.createElement('i');
    parent.insertBefore(fresh, ref);
    expect(parent.firstChild).toBe(fresh);
    expect(warn).not.toHaveBeenCalled();
  });

  it('insertBefore with a null reference appends', () => {
    installTranslateGuard();
    const parent = document.createElement('div');
    const fresh = parent.insertBefore(document.createElement('i'), null);
    expect(parent.lastChild).toBe(fresh);
  });

  it('insertBefore skips when the reference node was moved, instead of throwing', () => {
    installTranslateGuard();
    const parent = document.createElement('div');
    const elsewhere = document.createElement('font');
    const ref = elsewhere.appendChild(document.createTextNode('x'));
    const fresh = document.createElement('i');
    expect(() => parent.insertBefore(fresh, ref)).not.toThrow();
    expect(fresh.parentNode).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('is idempotent', () => {
    installTranslateGuard();
    const patched = Node.prototype.removeChild;
    installTranslateGuard();
    expect(Node.prototype.removeChild).toBe(patched);
  });
});
