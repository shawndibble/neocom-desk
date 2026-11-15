import type { Meta, StoryObj } from '@storybook/react-vite';
import { GlyphSlash } from './GlyphSlash';
import { ICON_SIZE, Share } from './icons';

/**
 * A slash over an icon: the mark's "off" state, so colour is never the only signal (§6c).
 * Place it in a `relative` wrapper beside the glyph it crosses out (`ShareMark`,
 * `MissingGrantBadge`).
 *
 * @summary Slash drawn over a glyph for its off state.
 */
const meta = {
  title: 'ui/GlyphSlash',
  component: GlyphSlash,
  tags: ['autodocs'],
  render: () => (
    <span className="relative inline-flex text-text-dim">
      <Share size={ICON_SIZE.md} />
      <GlyphSlash />
    </span>
  ),
} satisfies Meta<typeof GlyphSlash>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The share glyph, slashed. */
export const OverShare: Story = {};
