// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import indexHtml from '/index.html?raw';
import { FONT_SCALE_MIRROR_KEY, FONT_SCALE_STEPS } from '@/lib/fontScale';

/**
 * The pre-paint font-scale script in `index.html` runs before any bundle, so
 * it cannot import `fontScale.ts` — it carries its own copy of the key and the
 * step list. This runs the script as shipped against each case, so the copy
 * cannot drift from the store that writes the mirror.
 */
function bootScript(): string {
  const match = /<script id="font-scale-boot">([\s\S]*?)<\/script>/.exec(indexHtml);
  if (match === null) throw new Error('index.html has no #font-scale-boot script');
  return match[1];
}

function runBootScript(): void {
  // Indirect eval: the script runs at global scope, as a classic <script> does.
  (0, eval)(bootScript());
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.fontSize = '';
});

afterEach(() => {
  document.documentElement.style.fontSize = '';
});

describe('index.html font-scale boot script', () => {
  it('runs before the module entry', () => {
    expect(indexHtml.indexOf('id="font-scale-boot"')).toBeLessThan(
      indexHtml.indexOf('type="module"')
    );
  });

  it.each(FONT_SCALE_STEPS)('applies the mirrored step %s', (step) => {
    localStorage.setItem(FONT_SCALE_MIRROR_KEY, String(step));
    runBootScript();
    expect(document.documentElement.style.fontSize).toBe(`${step * 100}%`);
  });

  it('leaves the browser default alone when nothing is mirrored', () => {
    runBootScript();
    expect(document.documentElement.style.fontSize).toBe('');
  });

  it('ignores a value that is not a step', () => {
    localStorage.setItem(FONT_SCALE_MIRROR_KEY, '3');
    runBootScript();
    expect(document.documentElement.style.fontSize).toBe('');
  });

  it('does not throw when localStorage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(runBootScript).not.toThrow();
      expect(document.documentElement.style.fontSize).toBe('');
    } finally {
      getItem.mockRestore();
    }
  });
});
