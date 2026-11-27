import type { Meta, StoryObj } from '@storybook/react-vite';
import { DividedList } from './DividedList';

/**
 * @summary A hairline-bordered box with `divide-y` rows; the rows own their padding.
 */
const meta = {
  title: 'ui/DividedList',
  component: DividedList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DividedList>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = ['Veldspar', 'Scordite', 'Pyroxeres'].map((n) => (
  <li key={n} className="px-3 py-2 text-sm">
    {n}
  </li>
));

/** @summary The default `panel-2` fill. */
export const Default: Story = { args: { as: 'ul', children: rows } };

/** @summary `surface="panel"`, for a list in an already-inset area. */
export const PanelSurface: Story = { args: { as: 'ul', surface: 'panel', children: rows } };

/** @summary `surface="none"`: no fill of its own. */
export const NoSurface: Story = { args: { as: 'ul', surface: 'none', children: rows } };
