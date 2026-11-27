import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextInput } from './TextInput';
import { EditableValue } from './EditableValue';

const meta = {
  title: 'ui/EditableValue',
  component: EditableValue,
  tags: ['autodocs'],
  args: { label: 'Edit Have for Tritanium', children: '3,000', onEdit: () => {} },
} satisfies Meta<typeof EditableValue>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary At rest: the value and a faint pencil; a field box on hover or focus. */
export const AtRest: Story = {};

/**
 * @summary Click, or type a digit on it, to swap in the caller's field; Enter
 * or blur saves, Escape cancels, and focus comes back to the value.
 */
export const SwapsToAField: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(3000);
    const [draft, setDraft] = useState<string | null>(null);
    const [refocus, setRefocus] = useState(false);
    if (draft !== null) {
      const close = (save: boolean) => {
        if (save && Number.isFinite(Number(draft))) setValue(Number(draft));
        setDraft(null);
        setRefocus(true);
      };
      return (
        <TextInput
          size="sm"
          autoFocus
          aria-label="Have: Tritanium"
          className="w-24 text-right"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => close(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') close(true);
            if (e.key === 'Escape') close(false);
          }}
        />
      );
    }
    return (
      <EditableValue
        {...args}
        focusOnMount={refocus}
        onFocused={() => setRefocus(false)}
        onEdit={(seed) => setDraft(seed ?? String(value))}
      >
        {value.toLocaleString('en-US')}
      </EditableValue>
    );
  },
};
