import { describe, it, expect, afterEach } from 'vitest';
import {
  configureClipboard,
  configureClipboardReader,
  writeToClipboard,
  readFromClipboard,
} from './clipboard';

describe('clipboard reader/writer injection', () => {
  afterEach(() => {
    configureClipboard(null);
    configureClipboardReader(null);
  });

  it('writeToClipboard goes through the injected writer', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    await writeToClipboard('hello');
    expect(written).toEqual(['hello']);
  });

  it('readFromClipboard goes through the injected reader', async () => {
    configureClipboardReader(async () => 'pasted text');
    await expect(readFromClipboard()).resolves.toBe('pasted text');
  });

  it('restoring the reader with null drops the previously injected reader', () => {
    configureClipboardReader(async () => 'x');
    configureClipboardReader(null);
    expect(() => readFromClipboard()).toThrow();
  });
});
