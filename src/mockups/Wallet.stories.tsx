import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel, StatChip, StatChips } from '@/components/ui';
import { Wallet } from '@/routes/Wallet';
import { NewComponent } from './NewComponent';

/**
 * Worked example of the mockup workflow (docs/design/mockups/README.md): the
 * real Wallet page in the real shell, plus one proposed panel.
 *
 * New components in this mockup: `BalanceTrend` (the dashed, labelled panel).
 * Everything else is an existing primitive or the page itself.
 */
const meta = {
  title: 'mockups/Wallet',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/wallet/balance' } },
  render: () => (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <NewComponent name="BalanceTrend">
          <Panel title="Balance, last 30 days">
            <StatChips>
              <StatChip label="Change" value="+84.2M ISK" />
              <StatChip label="Best day" value="+31.0M ISK" />
              <StatChip label="Worst day" value="-12.4M ISK" />
            </StatChips>
          </Panel>
        </NewComponent>
      </div>
      <Wallet />
    </>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Proposed Wallet › Balance with a 30-day trend panel above the balance. New component: BalanceTrend. */
export const Proposed: Story = {};

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
