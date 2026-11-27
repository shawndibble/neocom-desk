import { useEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { NeedsConnection } from './NeedsConnection';

function PretendOffline({ children }: { children: ReactNode }) {
  useEffect(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
    return () => {
      Reflect.deleteProperty(navigator, 'onLine');
      window.dispatchEvent(new Event('online'));
    };
  }, []);
  return children;
}

const offline: Decorator = (Story) => (
  <PretendOffline>
    <Story />
  </PretendOffline>
);

/**
 * @summary Disables a sign-in control while the browser is offline, with a "Needs a connection" tooltip.
 */
const meta = {
  title: 'ui/NeedsConnection',
  component: NeedsConnection,
  tags: ['autodocs'],
  args: { children: <Button variant="primary">Log in with EVE</Button> },
} satisfies Meta<typeof NeedsConnection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Online the child is untouched. */
export const Online: Story = {};

/** @summary Offline the child is `aria-disabled`; hover or focus it for the reason. */
export const Offline: Story = { decorators: [offline] };

/** @summary Pass the control's own tooltip: online it is shown as is, offline the reason is added beneath it. */
export const WithOwnTooltip: Story = {
  args: {
    tooltip: 'Add character',
    children: (
      <Button variant="primary" aria-label="Add character">
        Add
      </Button>
    ),
  },
  decorators: [offline],
};
