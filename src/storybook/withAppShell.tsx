import type { Decorator } from '@storybook/react-vite';
import { AppShell } from './AppShell';

/**
 * Renders a page story inside the real app shell (rail, page header, page
 * tabs, and the phone shell's bottom tabs below `md`) for a fake signed-in
 * Character: sample Characters seeded into Dexie, every ESI call answered from
 * `sampleData`, anything else recorded as unexpected (`fixtureFetch.ts`).
 *
 * Opt in per story with `parameters: { shell: { path: '/wallet/balance' } }`.
 * Phone width comes from Storybook's viewport (`globals.viewport`), because
 * `Layout` picks its shell with a real `min-width` media query.
 */
export const withAppShell: Decorator = (Story, context) => {
  const shell = context.parameters.shell;
  if (!shell) return <Story />;
  return (
    <AppShell shell={shell}>
      <Story />
    </AppShell>
  );
};
