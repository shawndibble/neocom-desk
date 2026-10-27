import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeverityIcon } from './SeverityIcon';

/**
 * A rung of the severity ladder as tone plus glyph, so colour is never the only
 * signal (§7). Cue (§6c "Tinted pill"): a computed verdict, never clickable.
 * Decorative unless `label` is set.
 *
 * @summary Severity glyph for the corp board's deadline ladder.
 */
const meta = {
  title: 'ui/SeverityIcon',
  component: SeverityIcon,
  tags: ['autodocs'],
  args: { severity: 'critical' },
} satisfies Meta<typeof SeverityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Verdict cue (§7): critical, red octagon. */
export const Critical: Story = {};

/** @summary Verdict cue (§7): warning, amber triangle. */
export const Warning: Story = { args: { severity: 'warning' } };

/** @summary Verdict cue (§7): watch, accent. */
export const Watch: Story = { args: { severity: 'watch' } };

/** @summary Verdict cue (§7): clear, dim. */
export const Clear: Story = { args: { severity: 'clear' } };

/** @summary Named: `label` gives the glyph an accessible name where no text states the severity. */
export const Labelled: Story = { args: { label: 'Critical' } };
