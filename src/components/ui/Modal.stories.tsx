import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * @summary Native-`<dialog>` modal; the parent owns `open`. §6c "…" cue: a button whose label ends
 * in "…" opens a dialog that needs more input or a confirmation. Every placement is a story
 * below, open, since a closed Modal renders nothing.
 */
const meta = {
  title: 'ui/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'Rename plan',
    onClose: () => {},
    children: (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-text-dim">
          Plans are shown by name in the rail and the palette.
        </p>
        <div className="flex justify-end gap-2">
          <Button>Cancel</Button>
          <Button variant="primary">Rename</Button>
        </div>
      </div>
    ),
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary `center` (default): a short dialog that needs input or a confirmation. */
export const Center: Story = { args: { placement: 'center' } };

/** @summary `sheet`: a bottom-anchored mobile drawer. */
export const Sheet: Story = { args: { placement: 'sheet', title: 'Filters' } };

/** @summary `sheet-full`: the same drawer at full viewport height, for long lists. */
export const SheetFull: Story = {
  args: {
    placement: 'sheet-full',
    title: 'Pick a system',
    children: (
      <ul className="p-4 text-sm">
        {['Jita', 'Perimeter', 'Amarr', 'Dodixie', 'Rens', 'Hek'].map((s) => (
          <li key={s} className="border-b border-line py-2">
            {s}
          </li>
        ))}
      </ul>
    ),
  },
};

/** @summary `medium`: two columns that outgrow `center` but not `wide` (max-w-3xl). */
export const Medium: Story = {
  args: {
    placement: 'medium',
    title: 'Hurricane Fleet Issue',
    children: (
      <div className="grid grid-cols-2 gap-4 p-4 text-sm">
        <span>Killmail facts</span>
        <span>Fit</span>
      </div>
    ),
  },
};

/** @summary `wide`: multi-column content such as a comparison matrix. */
export const Wide: Story = {
  args: {
    placement: 'wide',
    title: 'Compare fits',
    children: (
      <div className="grid grid-cols-3 gap-4 p-4 text-sm">
        <span>Rifter</span>
        <span>Slasher</span>
        <span>Executioner</span>
      </div>
    ),
  },
};

/** @summary `media`: an enlarged image, sized to its content up to 95% of the viewport. */
export const Media: Story = {
  args: {
    placement: 'media',
    title: 'Enlarged tile',
    children: <div className="h-64 w-96 bg-panel-2" role="img" aria-label="Sample tile" />,
  },
};

/** @summary `titleActions`: a control beside the title, outside the heading that names the dialog. */
export const WithTitleActions: Story = {
  args: { titleActions: <Button size="sm">More</Button> },
};

/**
 * @summary `footer`: an action bar pinned to the dialog's foot, outside the scrolling body, which
 * scrolls above it.
 */
export const WithFooter: Story = {
  args: {
    placement: 'sheet',
    title: 'Filters',
    children: (
      <ul className="text-sm">
        {Array.from({ length: 30 }, (_, i) => (
          <li key={i} className="border-b border-line py-2">
            {`Filter option ${i + 1}`}
          </li>
        ))}
      </ul>
    ),
    footer: (
      <div className="flex gap-2">
        <Button className="flex-1">Cancel</Button>
        <Button variant="primary" className="flex-1">
          Apply
        </Button>
      </div>
    ),
  },
};
