import type { Meta, StoryObj } from '@storybook/react-vite';
import { HintText } from './HintText';

/**
 * @summary Text with a tooltip. Cue (§6c cue vocabulary): a dotted underline means "has a tooltip"
 * and nothing else; it shows at rest, is keyboard-focusable and taps open on a phone.
 */
const meta = {
  title: 'ui/HintText',
  component: HintText,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="h-32 w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HintText>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A truncated or abbreviated term with its full meaning in the bubble. */
export const Default: Story = {
  args: { content: 'Manufacturing job cost index', children: 'MJCI' },
};

/** @summary Tone follows `className`; the dotted underline follows the text colour. */
export const Toned: Story = {
  args: { content: 'Below the going rate', children: 'Underpriced', className: 'text-danger' },
};

/** @summary `desktopOnly`: cue and tap apply from `sm` up, for a name that only truncates there. */
export const DesktopOnly: Story = {
  args: { content: 'Full station name', children: 'Jita IV - Moon 4', desktopOnly: true },
};
