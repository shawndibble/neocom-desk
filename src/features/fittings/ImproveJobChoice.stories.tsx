import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImproveJobChoice } from './ImproveJobChoice';
import type { ExploreSpace, ImproveJob } from '@/engine/fittings/improveJob';

/** @summary The Improve Job setting: PvE / PvP / Explore with a hint, and Explore's space choice. */
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

/** @summary PvE: the job's hint, nothing else. */
export const Pve: Story = {};

/** @summary Explore: "Where it flies" with Dangerous picked by default. */
export const ExploreDangerous: Story = { args: { job: 'explore' } };

/** @summary Explore in Safe space: tank may go. */
export const ExploreSafe: Story = { args: { job: 'explore', space: 'safe' } };

function InteractiveJobChoice() {
  const [job, setJob] = useState<ImproveJob>('explore');
  const [space, setSpace] = useState<ExploreSpace>('dangerous');
  return <ImproveJobChoice job={job} onJobChange={setJob} space={space} onSpaceChange={setSpace} />;
}

/** @summary Interactive: switch the job and the space. */
export const Interactive: Story = { render: () => <InteractiveJobChoice /> };
