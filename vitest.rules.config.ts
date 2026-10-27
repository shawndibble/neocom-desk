import { defineConfig } from 'vitest/config';

// Firestore rules tests. Separate from vite.config.ts on purpose: these need
// the Firestore emulator (and a JRE), so `npm run test:run` must never pick
// them up. Run with `npm run test:rules`, which starts the emulator around
// this config via `firebase emulators:exec`.
export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    include: ['rules-tests/**/*.test.ts'],
    testTimeout: 10000,
    // One emulator, one database: files share state, so run them serially.
    fileParallelism: false,
  },
});
