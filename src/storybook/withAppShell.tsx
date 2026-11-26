import type { Decorator } from '@storybook/react-vite';
import { AppShell } from './AppShell';

export const withAppShell: Decorator = (Story, context) => {
  const shell = context.parameters.shell;
  if (!shell) return <Story />;
  return (
    <AppShell shell={shell}>
      <Story />
    </AppShell>
  );
};
