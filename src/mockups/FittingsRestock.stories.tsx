import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Minus } from '@phosphor-icons/react/dist/csr/Minus';
import { Plus } from '@phosphor-icons/react/dist/csr/Plus';
import { X } from '@phosphor-icons/react/dist/csr/X';
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  NativeSelect,
  PageHeader,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TextArea,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { NewComponent } from './NewComponent';

/**
 * Proposal for #4550: Market › Appraisal gets a second source for its list,
 * "From my Fittings". Pick saved Fittings, give each a hull count, and the same
 * Appraisal table nets the combined bill against what the pilot owns.
 *
 * Only the input changes. The result table and Minus owned netting are the
 * existing Appraisal's, so they are not redrawn. The one addition on the result
 * side is a "Send to Build Group…" entry (dashed outline) in the actions menu,
 * shown only when at least one line has a blueprint.
 *
 * The card title is the source select (Paste | From my Fittings), field chrome
 * like the Recent select beside it. Recent only shows for Paste.
 *
 * New components in this mockup: `FittingsSourcePicker` (the Fittings list with
 * count steppers). Sample data.
 */

interface PickedFit {
  id: string;
  hull: string;
  name: string;
  count: number;
}

const SAMPLE_FITS: readonly PickedFit[] = [
  { id: 'a', hull: 'Hurricane', name: 'Hurricane — 720mm arty', count: 10 },
  { id: 'b', hull: 'Scimitar', name: 'Scimitar — shield logi', count: 4 },
];

/** What the real Appraisal's copy menu offers today, with the count beside each. */
const COPY_ENTRIES: readonly [string, number][] = [
  ['Sell now', 5],
  ['List at undercut', 5],
  ['Refine', 3],
  ['Multibuy', 5],
];

function FittingsSourcePicker({
  fits,
  setFits,
}: {
  fits: readonly PickedFit[];
  setFits: (next: readonly PickedFit[]) => void;
}) {
  const bump = (id: string, by: number) =>
    setFits(fits.map((f) => (f.id === id ? { ...f, count: Math.max(0, f.count + by) } : f)));
  return (
    <NewComponent name="FittingsSourcePicker">
      <div className="flex flex-col gap-2">
        <NativeSelect aria-label="Add a Fitting" defaultValue="">
          <option value="">Add a Fitting…</option>
          <option>Rifter — frigate brawler</option>
          <option>Muninn — 720mm arty</option>
        </NativeSelect>
        <ul className="flex flex-col divide-y divide-line">
          {fits.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 basis-full">
                <div className="truncate text-sm">{f.name}</div>
                <div className="text-xs text-text-dim">{f.hull}</div>
              </div>
              <span className="text-xs mr-auto text-text-dim">Hulls</span>
              <IconButton
                icon={<Minus aria-hidden />}
                label={`Fewer ${f.hull} hulls`}
                onClick={() => bump(f.id, -1)}
              />
              <TextInput
                size="sm"
                type="number"
                inputMode="numeric"
                aria-label={`${f.hull} hulls`}
                value={String(f.count)}
                onChange={(e) =>
                  setFits(
                    fits.map((x) =>
                      x.id === f.id ? { ...x, count: Math.max(0, Number(e.target.value) || 0) } : x
                    )
                  )
                }
                className="field-no-spinner w-14 text-right"
              />
              <IconButton
                icon={<Plus aria-hidden />}
                label={`More ${f.hull} hulls`}
                onClick={() => bump(f.id, 1)}
              />
              <IconButton
                icon={<X aria-hidden />}
                label={`Remove ${f.name}`}
                onClick={() => setFits(fits.filter((x) => x.id !== f.id))}
              />
            </li>
          ))}
        </ul>
      </div>
    </NewComponent>
  );
}

type Source = 'paste' | 'fittings';

function Mockup({
  assetsRead = true,
  buildable = 2,
  initialSource = 'fittings',
}: {
  assetsRead?: boolean;
  buildable?: number;
  initialSource?: Source;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [fits, setFits] = useState<readonly PickedFit[]>(SAMPLE_FITS);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
      <PageHeader title="Market" />
      <Tabs
        label="Market sections"
        tabsId="mockup-market"
        value="appraisal"
        onChange={() => {}}
        tabs={[
          { id: 'browser', label: 'Market' },
          { id: 'orders', label: 'Open' },
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'appraisal', label: 'Appraisal' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel
          title={
            <Select value={source} onValueChange={(v) => setSource(v as Source)}>
              <SelectTrigger size="sm" aria-label="List source" className="w-auto max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paste">Paste</SelectItem>
                <SelectItem value="fittings">From my Fittings</SelectItem>
              </SelectContent>
            </Select>
          }
          actions={
            // Recent holds pasted text, so it only shows for the Paste source.
            source === 'paste' ? (
              <Select value="">
                <SelectTrigger size="sm" aria-label="Recent" className="w-32 max-w-full min-w-0">
                  <SelectValue placeholder="Recent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Tritanium, Pyerite (2h)</SelectItem>
                </SelectContent>
              </Select>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3">
            {source === 'fittings' ? (
              <FittingsSourcePicker fits={fits} setFits={setFits} />
            ) : (
              <TextArea
                aria-label="Items from inventory, multibuy or a fitting"
                rows={6}
                mono
                className="text-[0.6875rem]"
                placeholder={'Tritanium\t124,500\nDamage Control II\t3'}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox defaultChecked disabled={!assetsRead} />
                Minus what I own at
              </label>
              <NativeSelect aria-label="Where to count what you own" defaultValue="jita">
                <option value="jita">Jita</option>
                <option value="all">All locations</option>
              </NativeSelect>
            </div>
            {!assetsRead && (
              <p role="note" className="text-xs text-warning">
                Neocom Desk hasn&apos;t read this Character&apos;s assets, so nothing is netted and
                every line shows as needed. Grant Assets to subtract what you own.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Appraise</Button>
              <Button>Clear</Button>
            </div>
          </div>
        </Panel>

        <Panel
          title="Appraisal"
          actions={
            <DropdownMenu defaultOpen>
              <DropdownMenuTrigger asChild>
                <IconButton size="sm" icon={<Icon.More />} label="Appraisal actions" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" avoidCollisions={false}>
                {COPY_ENTRIES.map(([name, count]) => (
                  <DropdownMenuItem key={name}>
                    {name}
                    <span className="ml-auto pl-3 text-text-dim">{count}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem>Download CSV</DropdownMenuItem>
                <DropdownMenuItem>Download Excel</DropdownMenuItem>
                {buildable > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {/* New entry: only present when at least one line has a blueprint. */}
                    <DropdownMenuItem className="outline-dashed outline-1 outline-warning">
                      Send to Build Group…
                      <span className="ml-auto pl-3 text-text-dim">{buildable}</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        >
          <div className="flex h-72 items-start justify-center rounded-xs border border-dashed border-line p-4 text-xs text-text-dim">
            The Appraisal result table, unchanged: Minus owned already nets the combined list.
          </div>
        </Panel>
      </div>
    </div>
  );
}

const meta = {
  title: 'mockups/FittingsRestock',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/market/appraisal' } },
  render: () => <Mockup />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Appraisal's input card with the "From my Fittings" source, and the result actions menu with Send to Build Group…. New component: FittingsSourcePicker. */
export const Proposed: Story = {};

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = { globals: phone };

/** @summary No assets read for the Character: the existing grant note, with nothing netted. */
export const NoAssets: Story = { render: () => <Mockup assetsRead={false} /> };

/** @summary Nothing in the list can be built (all faction or meta modules): the Send to Build Group entry is absent from the menu. */
export const NothingBuildable: Story = { render: () => <Mockup buildable={0} /> };

/** @summary The same card on the Paste source: the title select reads "Paste" and Recent returns beside it. */
export const PasteSource: Story = { render: () => <Mockup initialSource="paste" /> };
