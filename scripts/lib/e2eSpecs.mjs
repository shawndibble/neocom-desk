import { readdirSync } from 'node:fs';
import { isLayoutSpec } from './ciPlan.mjs';

export function listE2eSpecs({ skipLayout = false } = {}) {
  return readdirSync('e2e')
    .filter((name) => name.endsWith('.spec.ts'))
    .filter((name) => !name.endsWith('.book.spec.ts'))
    .map((name) => `e2e/${name}`)
    .filter((file) => !(skipLayout && isLayoutSpec(file)));
}
