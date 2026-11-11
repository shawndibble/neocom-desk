import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureClipboard, writeToClipboard } from './clipboard';

afterEach(() => configureClipboard(null));

describe('writeToClipboard on a page with no Clipboard API', () => {
  it('copies the old way when the page has no Clipboard API, and says when that fails', async () => {
    const copy = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: copy, configurable: true });
    await expect(writeToClipboard('hello')).resolves.toBeUndefined();
    expect(copy).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    copy.mockReturnValue(false);
    await expect(writeToClipboard('hello')).rejects.toThrow();
  });
});
