import type { Meta, StoryObj } from '@storybook/react-vite';
import { PopularFitRow } from './PopularFitRow';
import { PopularFitVerdict } from './PopularFitVerdict';
import { FIT_ROW_CLASS } from './VirtualFitList';

const GAPS = {
  kind: 'missing',
  skills: [
    { skillTypeID: 3300, targetLevel: 5, name: 'Gunnery' },
    { skillTypeID: 3436, targetLevel: 3, name: 'Drones' },
    { skillTypeID: 3335, targetLevel: 4, name: 'Gallente Cruiser' },
  ],
  unusableTypeIds: new Set([3001]),
  omegaOnly: false,
} as const;

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

export const CanFly: Story = {};

export const Missing: Story = {
  args: { verdict: GAPS },
};

export const OmegaOnly: Story = {
  args: { verdict: { ...GAPS, skills: GAPS.skills.slice(0, 1), omegaOnly: true } },
};

export const Unknown: Story = { args: { verdict: { kind: 'unknown' } } };

const NO_NAMES = new Map<number, string>();

export const InRowsAtPhoneWidth: Story = {
  render: () => (
    <ul className="w-[358px] space-y-1">
      <li className={FIT_ROW_CLASS}>
        <PopularFitRow
          source="loss"
          title="12 losses"
          meta=" · last seen 2h ago"
          price="~87.5M ISK"
          verdict={<PopularFitVerdict verdict={{ kind: 'canFly' }} />}
          modules={[]}
          names={NO_NAMES}
          onOpen={() => {}}
        />
      </li>
      <li className={FIT_ROW_CLASS}>
        <PopularFitRow
          source="loss"
          title="7 losses"
          meta=" · last seen 1d ago"
          price="~64.2M ISK"
          verdict={<PopularFitVerdict verdict={{ ...GAPS, omegaOnly: true }} />}
          modules={[
            { slot: 'high', typeId: 3001 },
            { slot: 'medium', typeId: 3244 },
            { slot: 'low', typeId: 2048 },
          ]}
          unusable={GAPS.unusableTypeIds}
          names={NO_NAMES}
          onOpen={() => {}}
        />
      </li>
    </ul>
  ),
};
