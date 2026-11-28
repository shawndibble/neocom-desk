import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { XL_UP_QUERY } from './useIsXlUp';

it('matches the xl breakpoint the stylesheet defines', () => {
  const css = readFileSync(join(__dirname, '..', 'styles', 'index.css'), 'utf8');
  const xl = /--breakpoint-xl:\s*([\d.]+rem)/.exec(css)?.[1];
  expect(XL_UP_QUERY).toBe(`(min-width: ${xl})`);
});
