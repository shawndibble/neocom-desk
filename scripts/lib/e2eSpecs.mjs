import { readdirSync } from 'node:fs';
import { isLayoutSpec } from './ciPlan.mjs';

/**
 * The spec files `e2e-shard` jobs deal out, e.g. `e2e/auth.spec.ts`.
 * @param {{ skipLayout?: boolean }} [options] `skipLayout` leaves out the
 *   geometry specs a PR does not run (`isLayoutSpec`)
 */
export function listE2eSpecs({ skipLayout = false } = {}) {
  return (
    readdirSync('e2e')
      .filter((name) => name.endsWith('.spec.ts'))
      // The Corp Tax Book specs run under playwright.book.config.ts (the Firebase emulators), not here.
      .filter((name) => !name.endsWith('.book.spec.ts'))
      .map((name) => `e2e/${name}`)
      .filter((file) => !(skipLayout && isLayoutSpec(file)))
  );
}
