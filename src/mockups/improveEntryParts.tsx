import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Eyebrow,
  IconButton,
  StatChange,
} from '@/components/ui';
import { textActionClassName } from '@/components/ui/textActionClassName';
import * as Icon from '@/components/ui/icons';
import { NewComponent } from './NewComponent';
import { SHIP } from './improveResultsFirstFixtures';

export type EntryMode = 'header' | 'slot' | 'both';

const SLOTS = [
  { name: '720mm Howitzer Artillery I', fitted: true },
  { name: '720mm Howitzer Artillery I', fitted: true },
  { name: 'Empty high slot', fitted: false },
  { name: 'Medium Armor Repairer I', fitted: true },
];

/** The fit page behind the drawer: stats column and slots, with the proposed contextual Improve entries. */
export function FitPageEntries({ entry }: { entry: EntryMode }) {
  const inHeader = entry === 'header' || entry === 'both';
  const inSlot = entry === 'slot' || entry === 'both';
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[1fr_20rem]">
      <section className="border-line bg-surface space-y-2 rounded-xs border p-3 md:order-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Stats</h2>
          {inHeader && (
            <NewComponent name="StatsImproveAction">
              <button type="button" className={textActionClassName('gap-1')}>
                Improve…
              </button>
            </NewComponent>
          )}
        </div>
        <Eyebrow>Offense</Eyebrow>
        <p className="text-sm">
          <StatChange change={{ key: 'sustainedDps', before: 90.7, after: 90.7 }} />
        </p>
        <Eyebrow>Defense</Eyebrow>
        <p className="text-sm">
          <StatChange change={{ key: 'ehp', before: 41_200, after: 41_200 }} />
        </p>
        <Eyebrow>Navigation</Eyebrow>
        <p className="text-sm">
          <StatChange change={{ key: 'maxVelocity', before: 1_085, after: 1_085 }} />
        </p>
      </section>
      <section className="border-line bg-surface space-y-1 rounded-xs border p-3 md:order-1">
        <h2 className="text-sm font-semibold">{SHIP}</h2>
        <Eyebrow>High slots</Eyebrow>
        <ul className="divide-line divide-y">
          {SLOTS.map((slot, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-1 text-sm">
              <span className={slot.fitted ? '' : 'text-text-dim'}>{slot.name}</span>
              {!slot.fitted &&
                (inSlot ? (
                  <NewComponent name="EmptySlotMenu">
                    <DropdownMenu defaultOpen modal={false}>
                      <DropdownMenuTrigger asChild>
                        <IconButton icon={<Icon.More />} label="Empty slot actions" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Add module…</DropdownMenuItem>
                        <DropdownMenuItem>Improve… fill this slot</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </NewComponent>
                ) : (
                  <Button size="sm">Add module…</Button>
                ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
