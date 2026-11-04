import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modal, TypeIcon } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Caret } from '@/components/ui/Disclosure';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';

/**
 * Route Safety kill-location modal (issue #5929). Pressing a location line
 * ("3 kills at Stargate (Nourvukaiken)") opens this for that location; the
 * row's kill count opens it for the whole system, one section per location.
 * The page behind is the real Travel route.
 *
 * - **Location**: one gate's last-hour kills, newest first, hull summary in
 *   the header. The first kill is expanded to show attackers.
 * - **System**: two gate camps and a station in one system, on-path gate first.
 * - **Phone**: full-height sheet.
 *
 * New components in this mockup: `KillLocationModal` (header chips, kill rows,
 * attacker list). `Modal`, `Pill`, `TypeIcon`, `ExternalLink` are existing.
 */
const meta = {
  title: 'mockups/RouteSafetyKills',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/travel' } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

interface Attacker {
  name: string;
  corp: string;
  ship: [number, string];
  weapon: string;
  finalBlow?: boolean;
}
interface Kill {
  ago: string;
  victim: string;
  victimOrg: string;
  ship: [number, string];
  value: string;
  attackers: number;
  tags?: string[];
  list: Attacker[];
}

const TORNADO: [number, string] = [4306, 'Tornado'];
const CATALYST: [number, string] = [16240, 'Catalyst'];
const SABRE: [number, string] = [22456, 'Sabre'];

const GATE_A: Kill[] = [
  {
    ago: '4 min ago',
    victim: 'Mara Veltis',
    victimOrg: 'Haul & Co. · Free Lanes',
    ship: [648, 'Badger'],
    value: '412M',
    attackers: 6,
    tags: ['Interdictor on the mail'],
    list: [
      { name: 'Jek Orrow', corp: 'Red Tide', ship: SABRE, weapon: 'Interdiction Sphere Launcher' },
      {
        name: 'Tarn Kolvi',
        corp: 'Red Tide',
        ship: TORNADO,
        weapon: '800mm Repeating Cannon',
        finalBlow: true,
      },
      { name: 'Sil Dane', corp: 'Red Tide', ship: TORNADO, weapon: '800mm Repeating Cannon' },
    ],
  },
  {
    ago: '19 min ago',
    victim: 'Oren Fask',
    victimOrg: 'Fask Freight',
    ship: [648, 'Badger'],
    value: '96M',
    attackers: 5,
    list: [
      {
        name: 'Tarn Kolvi',
        corp: 'Red Tide',
        ship: TORNADO,
        weapon: '800mm Repeating Cannon',
        finalBlow: true,
      },
      { name: 'Vee Harlan', corp: 'Red Tide', ship: CATALYST, weapon: 'Light Neutron Blaster II' },
    ],
  },
  {
    ago: '32 min ago',
    victim: 'Dax Pelor',
    victimOrg: 'Lone Wolves · Free Lanes',
    ship: [648, 'Badger'],
    value: '58M',
    attackers: 4,
    tags: ['Smartbombs'],
    list: [
      {
        name: 'Jek Orrow',
        corp: 'Red Tide',
        ship: SABRE,
        weapon: 'Large Smartbomb II',
        finalBlow: true,
      },
    ],
  },
];

const GATE_B: Kill[] = [
  {
    ago: '11 min ago',
    victim: 'Ilsa Quor',
    victimOrg: 'Quor Mining',
    ship: [17476, 'Covetor'],
    value: '74M',
    attackers: 2,
    list: [
      {
        name: 'Brix Anaya',
        corp: 'Gate Tax Ltd',
        ship: CATALYST,
        weapon: 'Light Neutron Blaster II',
        finalBlow: true,
      },
    ],
  },
];

const STATION: Kill[] = [
  {
    ago: '27 min ago',
    victim: 'Nol Tessa',
    victimOrg: 'Tessa Trading',
    ship: [648, 'Badger'],
    value: '31M',
    attackers: 3,
    list: [
      {
        name: 'Brix Anaya',
        corp: 'Gate Tax Ltd',
        ship: CATALYST,
        weapon: 'Light Neutron Blaster II',
        finalBlow: true,
      },
    ],
  },
];

function ShipLine({ ship, className = '' }: { ship: [number, string]; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <TypeIcon typeId={ship[0]} size={32} className="size-5 rounded-xs" />
      {ship[1]}
    </span>
  );
}

function KillRow({ kill, open }: { kill: Kill; open?: boolean }) {
  const [expanded, setExpanded] = useState(open ?? false);
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-panel-2"
      >
        <TypeIcon typeId={kill.ship[0]} size={64} className="mt-0.5 size-9 shrink-0 rounded-xs" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-text">{kill.victim}</span>
            <span className="text-text-dim">{kill.ship[1]}</span>
            {kill.tags?.map((tag) => (
              <Pill key={tag} tone="warning">
                {tag}
              </Pill>
            ))}
          </span>
          <span className="block truncate text-xs text-text-dim">{kill.victimOrg}</span>
        </span>
        <span className="shrink-0 text-right text-xs tabular-nums text-text-dim">
          <span className="block font-medium text-text">{kill.value} ISK</span>
          {kill.ago} · {kill.attackers} attackers
        </span>
        <Caret expanded={expanded} />
      </button>
      {expanded && (
        <div className="bg-panel-2 px-3 pb-2 pt-1 pl-14 text-sm">
          <ul className="space-y-1">
            {kill.list.map((a) => (
              <li key={a.name + a.weapon} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="w-28 font-medium text-text">{a.name}</span>
                <ShipLine ship={a.ship} className="w-32 text-text" />
                <span className="text-text-dim">{a.weapon}</span>
                {a.finalBlow && <Pill tone="accent">Final blow</Pill>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-text-dim">
            Showing {kill.list.length} of {kill.attackers} attackers ·{' '}
            <ExternalLink href="https://zkillboard.com/">Killmail on zKillboard</ExternalLink>
          </p>
        </div>
      )}
    </li>
  );
}

function Section({
  title,
  sub,
  kills,
  open,
}: {
  title?: string;
  sub?: string;
  kills: Kill[];
  open?: boolean;
}) {
  return (
    <section>
      {title && (
        <h3 className="sticky top-0 z-10 flex items-center gap-2 border-y border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-dim">
          {title}
          {sub && <Pill tone="accent">{sub}</Pill>}
          <span className="ml-auto font-normal normal-case tracking-normal">
            {kills.length} {kills.length === 1 ? 'kill' : 'kills'}
          </span>
        </h3>
      )}
      <ul>
        {kills.map((k, i) => (
          <KillRow key={k.victim} kill={k} open={open && i === 0} />
        ))}
      </ul>
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-2 text-xs text-text-dim">
      {items.map((i) => (
        <span key={i}>{i}</span>
      ))}
    </div>
  );
}

function KillLocationModal({ scope }: { scope: 'location' | 'system' }) {
  const phone = useIsPhone();
  const location = scope === 'location';
  return (
    <NewComponent name="KillLocationModal">
      <Modal
        open
        onClose={() => undefined}
        placement={phone ? 'sheet-full' : 'wide'}
        title={location ? 'Stargate (Nourvukaiken) · Tama' : 'Tama · last hour'}
      >
        <Chips
          items={
            location
              ? [
                  '3 kills',
                  'Last 4 min ago',
                  'Interdictor on the mail',
                  'Smartbombs',
                  'Tornado on 2 of 3 kills · Sabre on 2 of 3 kills',
                ]
              : ['5 kills at 3 places', 'Last 4 min ago', 'Two gates and a station']
          }
        />
        {location ? (
          <Section kills={GATE_A} open />
        ) : (
          <>
            <Section title="Stargate (Nourvukaiken)" sub="On your route" kills={GATE_A} open />
            <Section title="Stargate (Sivala)" kills={GATE_B} />
            <Section title="Tama V - Moon 4 - Station" kills={STATION} />
          </>
        )}
      </Modal>
    </NewComponent>
  );
}

/** @summary One gate's kills: header chips with the hull summary, kill rows, first expanded to its attackers. */
export const Location: Story = { render: () => <KillLocationModal scope="location" /> };

/** @summary The kill count opens the system: a section per location, on-path gate first. */
export const System: Story = { render: () => <KillLocationModal scope="system" /> };

/** @summary The location modal as a full-height phone sheet. */
export const LocationPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <KillLocationModal scope="location" />,
};
