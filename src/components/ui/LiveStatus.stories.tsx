import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveStatus } from './LiveStatus';

/**
 * Visually hidden polite live region (WCAG 4.1.3, §7). It has no visual cue
 * by design; the story renders it next to visible text for context.
 *
 * @summary Screen-reader status message for results, "Copied" and failed loads.
 */
const meta = {
  title: 'ui/LiveStatus',
  component: LiveStatus,
  tags: ['autodocs'],
  args: { children: '12 results' },
  decorators: [
    (Story) => (
      <div>
        <p className="text-sm text-text-dim">The region below is announced, not shown.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiveStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Status message (§7): a result count read out politely when it changes. */
export const ResultCount: Story = {};

/** @summary Status message (§7): `announceKey` re-reads identical text ("Copied" twice). */
export const Reannounce: Story = { args: { children: 'Copied', announceKey: 1 } };

/** @summary Status message (§7): an empty region is silent but stays mounted. */
export const Silent: Story = { args: { children: null } };
