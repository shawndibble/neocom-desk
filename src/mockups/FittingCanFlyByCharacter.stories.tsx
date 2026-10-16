import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { Fittings } from '@/routes/Fittings';
import { NewComponent } from './NewComponent';

/**
 * Proposal: the "All Characters" Can-fly list, open here as it would be from a
 * saved Fitting's detail header (today it opens only from a Fitting Compare
 * column). Each Character that can't fly the Fitting says how many skills it
 * is missing and how long they take to train.
 *
 * New components in this mockup: `CanFlyGapRow` (the missing-skills and
 * training-time line under a Character that can't fly). The trigger is the
 * existing inline link; the list is the existing popover's list.
 */

interface Row {
  name: string;
  canFly: boolean;
  missing?: number;
  trainTime?: string;
}

const rows: Row[] = [
  { name: 'Kestrel Vane', canFly: true },
  { name: 'Orsa Tellemar', canFly: false, missing: 4, trainTime: '6d 3h' },
];

function Proposal() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-4">
      <Panel
        title="Hurricane · Fleet Autocannon"
        actions={
          <button type="button" className={inlineLinkClassName}>
            Can fly: all Characters
          </button>
        }
      >
        <div className="ml-auto w-full max-w-sm rounded-xs border border-line bg-panel-2 p-3 text-sm">
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.name}>
                <div className="flex items-center justify-between gap-4">
                  <span className="truncate text-text">{row.name}</span>
                  <span className={row.canFly ? 'text-success' : 'text-danger'}>
                    {row.canFly ? 'Can fly' : "Can't fly"}
                  </span>
                </div>
                {!row.canFly && (
                  <NewComponent name="CanFlyGapRow">
                    <span className="block text-xs text-text-dim tabular-nums">
                      {row.missing} skills missing · {row.trainTime} to train
                    </span>
                  </NewComponent>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

const meta = {
  title: 'mockups/FittingCanFlyByCharacter',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/fittings' } },
  render: () => (
    <>
      <Proposal />
      <Fittings />
    </>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The All Characters Can-fly list opened from a saved Fitting, with missing-skill count and training time per Character. New component: CanFlyGapRow. */
export const Proposed: Story = {};

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
