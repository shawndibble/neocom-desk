import type { Meta, StoryObj } from '@storybook/react-vite';
import { DividedList } from './DividedList';

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

export const Default: Story = { args: { as: 'ul', children: rows } };

export const PanelSurface: Story = { args: { as: 'ul', surface: 'panel', children: rows } };

export const NoSurface: Story = { args: { as: 'ul', surface: 'none', children: rows } };
