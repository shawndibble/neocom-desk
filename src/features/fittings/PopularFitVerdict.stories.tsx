import type { Meta, StoryObj } from '@storybook/react-vite';
import { PopularFitRow } from './PopularFitRow';
import { PopularFitVerdict } from './PopularFitVerdict';
import { FIT_ROW_CLASS } from './VirtualFitList';

/** @summary A Popular fit row's can-fly verdict for the active Character (#6011). */
const meta = {
  title: 'fittings/PopularFitVerdict',
  component: PopularFitVerdict,
  tags: ['autodocs'],
  args: { verdict: { kind: 'canFly' } },
  decorators: [
    (Story) => (
      <div className="w-[24rem] max-w-full p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PopularFitVerdict>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Every skill the fit needs is trained. */
export const CanFly: Story = {};

/** @summary Skills to train first, counted as the editor's Missing skills chip counts them. */
export const Missing: Story = {
  args: { verdict: { kind: 'missing', count: 3, omegaOnly: false } },
};

/** @summary An Alpha who needs a skill past the Alpha cap. */
export const OmegaOnly: Story = {
  args: { verdict: { kind: 'missing', count: 1, omegaOnly: true } },
};

/** @summary A type's requirements couldn't be read: never shown as flyable. */
export const Unknown: Story = { args: { verdict: { kind: 'unknown' } } };

const NO_NAMES = new Map<number, string>();

/** @summary In a row at phone width: the verdict keeps its width; the title truncates first. */
export const InRowsAtPhoneWidth: Story = {
  render: () => (
    <ul className="w-[358px] space-y-1">
      <li className={FIT_ROW_CLASS}>
        <PopularFitRow
          title="12 losses"
          meta=" · last seen 2h ago · ~87.5M ISK"
          verdict={<PopularFitVerdict verdict={{ kind: 'canFly' }} />}
          modules={[]}
          names={NO_NAMES}
          onOpen={() => {}}
        />
      </li>
      <li className={FIT_ROW_CLASS}>
        <PopularFitRow
          title="7 losses"
          meta=" · last seen 1d ago · ~64.2M ISK"
          verdict={<PopularFitVerdict verdict={{ kind: 'missing', count: 3, omegaOnly: true }} />}
          modules={[]}
          names={NO_NAMES}
          onOpen={() => {}}
        />
      </li>
    </ul>
  ),
};
