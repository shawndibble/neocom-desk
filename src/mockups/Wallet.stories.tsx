import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel, StatChip, StatChips } from '@/components/ui';
import { Wallet } from '@/routes/Wallet';
import { NewComponent } from './NewComponent';

const meta = {
  title: 'mockups/Wallet',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/wallet/balance' } },
  render: () => (
    <>
      <div className="mx-auto max-w-page px-4 pt-4">
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

export const Proposed: Story = {};

export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
