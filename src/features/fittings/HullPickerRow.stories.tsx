import type { Meta, StoryObj } from '@storybook/react-vite';
import { HullPickerRow } from './HullPickerRow';
import type { HullFlyMark } from './useHullFlyMarks';

const CAN_FLY: HullFlyMark = {
  status: { canFly: true, secondsToFly: 0, mastery: 2 },
  needsOmega: false,
};
const MASTERY_V: HullFlyMark = {
  status: { canFly: true, secondsToFly: 0, mastery: 5 },
  needsOmega: false,
};
const CANT_FLY: HullFlyMark = {
  status: { canFly: false, secondsToFly: 86_400, mastery: 0 },
  needsOmega: false,
};
const NEEDS_OMEGA: HullFlyMark = { ...CANT_FLY, needsOmega: true };

/** @summary A hull picker row: the Ship Tree's can-fly mark, the hull, and Ω when it needs Omega (#6011). */
const meta = {
  title: 'fittings/HullPickerRow',
  component: HullPickerRow,
  tags: ['autodocs'],
  args: {
    hull: { typeId: 587, name: 'Rifter', group: 'Minmatar' },
    mark: CAN_FLY,
    marked: true,
    selected: false,
    onSelect: () => {},
    onStart: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-[24rem] max-w-full p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HullPickerRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The active Character can fly it: a filled dot. */
export const CanFly: Story = {};

/** @summary Can't fly yet: a hollow ring. */
export const CantFlyYet: Story = { args: { mark: CANT_FLY } };

/** @summary An Alpha who can't fly it, its class past the Alpha cap: ring and Ω. */
export const NeedsOmega: Story = {
  args: { hull: { typeId: 11371, name: 'Wolf', group: 'Minmatar' }, mark: NEEDS_OMEGA },
};

const ROWS: { typeId: number; name: string; mark: HullFlyMark | undefined }[] = [
  { typeId: 587, name: 'Rifter', mark: MASTERY_V },
  { typeId: 598, name: 'Breacher', mark: CAN_FLY },
  { typeId: 11371, name: 'Wolf', mark: NEEDS_OMEGA },
  { typeId: 33816, name: 'Garmur', mark: CANT_FLY },
  { typeId: 0, name: 'Rifter Krusual Edition (no Ship Tree entry)', mark: undefined },
  {
    typeId: 1,
    name: "Republic Fleet Firetail Sebiestor Tribe Commemorative SKIN'd Long Name",
    mark: NEEDS_OMEGA,
  },
];

/** @summary A column at phone width: names line up and wrap, never truncated by the marks. */
export const ColumnAtPhoneWidth: Story = {
  render: (args) => (
    <ul className="w-[358px]">
      {ROWS.map((row) => (
        <li key={row.typeId}>
          <HullPickerRow
            {...args}
            hull={{ typeId: row.typeId, name: row.name, group: 'Minmatar' }}
            mark={row.mark}
            selected={row.typeId === 598}
          />
        </li>
      ))}
    </ul>
  ),
};
