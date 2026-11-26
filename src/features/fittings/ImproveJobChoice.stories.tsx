import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImproveJobChoice } from './ImproveJobChoice';
import type { ExploreSpace, ImproveJob } from '@/engine/fittings/improve';

const meta = {
  title: 'fittings/ImproveJobChoice',
  component: ImproveJobChoice,
  tags: ['autodocs'],
  args: { job: 'pve', onJobChange: () => {}, onSpaceChange: () => {} },
  decorators: [
    (Story) => (
      <div className="w-[24rem] max-w-full p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImproveJobChoice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pve: Story = {};

export const ExploreDangerous: Story = { args: { job: 'explore' } };

export const ExploreSafe: Story = { args: { job: 'explore', space: 'safe' } };

function InteractiveJobChoice() {
  const [job, setJob] = useState<ImproveJob>('explore');
  const [space, setSpace] = useState<ExploreSpace>('dangerous');
  return <ImproveJobChoice job={job} onJobChange={setJob} space={space} onSpaceChange={setSpace} />;
}

export const Interactive: Story = { render: () => <InteractiveJobChoice /> };
