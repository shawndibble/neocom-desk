import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  Checkbox,
  EmptyState,
  PageHeader,
  Panel,
  SearchInput,
  SegmentedControl,
  TabPanel,
  Tabs,
  useTabsId,
} from '@/components/ui';
import { NewComponent } from './NewComponent';

/**
 * Proposed Communities page: what the open Character shares with a Community.
 * Three layouts for the same rules:
 *
 * - Fittings and Blueprints: "Share all" on/off. While on, every entry is
 *   listed and can be revoked one by one. While off, entries are added one by
 *   one through a search.
 * - Skill plans: never "share all". Each plan is added and removed by hand.
 * - Blueprints get their own share-all switch, like fittings.
 * - A link to Industry › Sourcing, filtered to the Community's blueprints
 *   (no market, contract or LP store sources), says where to browse them.
 * - The Character's own blueprints are listed here too.
 *
 * - Admins also get Members (pending Accept/Decline when "Approve new members"
 *   is on, plus Make admin / Remove) and Invites (link, mail invite, approval switch).
 *
 * New components in this mockup: `ShareScopeRow` (share-all switch + summary),
 * `SharedItemRow` (name, detail, Stop sharing), `AddSharedItem` (search that
 * adds one entry), `BrowseBlueprintsLink` (the Sourcing link).
 * Everything else is an existing primitive.
 */

type Kind = 'fittings' | 'blueprints' | 'plans';

interface Item {
  id: string;
  name: string;
  detail: string;
}

const KIND_LABEL: Record<Kind, string> = {
  fittings: 'Fittings',
  blueprints: 'Blueprints',
  plans: 'Skill plans',
};

const ITEMS: Record<Kind, Item[]> = {
  fittings: [
    { id: 'f1', name: 'Vexor Navy Issue - Mission', detail: 'Vexor Navy Issue · 8 modules' },
    { id: 'f2', name: 'Caracal - Tackle', detail: 'Caracal · 7 modules' },
    { id: 'f3', name: 'Ferox - Fleet Anchor', detail: 'Ferox · 8 modules' },
  ],
  blueprints: [
    { id: 'b1', name: 'Hobgoblin II Blueprint', detail: 'BPO · ME 10 · TE 20' },
    { id: 'b2', name: 'Caldari Navy Antimatter Charge S Blueprint', detail: 'BPC · 40 runs' },
    { id: 'b3', name: 'Medium Shield Extender II Blueprint', detail: 'BPO · ME 8 · TE 16' },
    { id: 'b4', name: 'Vexor Navy Issue Blueprint', detail: 'BPO · ME 5 · TE 10' },
  ],
  plans: [
    { id: 'p1', name: 'Marauder to level V', detail: '41 skills · 38d 6h' },
    { id: 'p2', name: 'Industry basics', detail: '12 skills · 2d 3h' },
  ],
};

const SEARCH_HINT: Record<Kind, string> = {
  fittings: 'Search your fittings to share',
  blueprints: 'Search your blueprints to share',
  plans: 'Search your skill plans to share',
};

function SharedItemRow({ item, onStop }: { item: Item; onStop: () => void }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-xs">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.name}</span>
        <span className="block truncate text-text-dim">{item.detail}</span>
      </span>
      <Button size="sm" onClick={onStop}>
        Stop sharing
      </Button>
    </li>
  );
}

function ShareScopeRow({
  kind,
  all,
  count,
  total,
  onToggle,
}: {
  kind: Kind;
  all: boolean;
  count: number;
  total: number;
  onToggle: (next: boolean) => void;
}) {
  if (kind === 'plans') {
    return (
      <p className="text-xs text-text-dim">Skill plans are shared one at a time. {count} shared.</p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-h-8 items-center gap-2 text-xs font-medium">
        <Checkbox checked={all} onChange={(event) => onToggle(event.target.checked)} />
        Share all my {KIND_LABEL[kind].toLowerCase()}
      </label>
      <span className="text-xs text-text-dim">
        {all ? `All ${total} shared, including new ones` : `${count} of ${total} shared`}
      </span>
    </div>
  );
}

function AddSharedItem({ kind, disabled }: { kind: Kind; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <SearchInput
        className="min-w-40 flex-1"
        placeholder={disabled ? 'Everything is shared' : SEARCH_HINT[kind]}
        aria-label={SEARCH_HINT[kind]}
        disabled={disabled}
      />
      <Button size="sm" disabled={disabled}>
        Add
      </Button>
    </div>
  );
}

function BrowseBlueprintsLink() {
  return (
    <p className="text-xs">
      <a href="/industry/sourcing?source=community" className="text-accent underline">
        Browse every blueprint shared in this Community
      </a>
      <span className="text-text-dim"> · Industry › Sourcing, community blueprints only</span>
    </p>
  );
}

/** One kind's controls and list, as every option below uses it. */
function KindSection({ kind }: { kind: Kind }) {
  const [all, setAll] = useState(kind === 'fittings');
  const [items, setItems] = useState(ITEMS[kind]);
  const shown = kind === 'plans' ? items : all ? ITEMS[kind] : items.slice(0, 2);
  return (
    <div className="space-y-2">
      <ShareScopeRow
        kind={kind}
        all={all}
        count={shown.length}
        total={ITEMS[kind].length}
        onToggle={setAll}
      />
      {(kind === 'plans' || !all) && <AddSharedItem kind={kind} disabled={false} />}
      {kind === 'blueprints' && <BrowseBlueprintsLink />}
      {kind === 'plans' && (
        <p className="text-xs">
          <a href="/skills?plans=community" className="text-accent underline">
            Browse skill plans shared in this Community
          </a>
          <span className="text-text-dim"> · Skills › Plans, with search and Copy to my plans</span>
        </p>
      )}
      {kind === 'fittings' && (
        <p className="text-xs">
          <a href="/fittings?source=community" className="text-accent underline">
            Search fittings, mine and shared in this Community
          </a>
          <span className="text-text-dim"> · Fittings, Mine / Community switch</span>
        </p>
      )}
      {shown.length === 0 ? (
        <EmptyState title={`No ${KIND_LABEL[kind].toLowerCase()} shared yet`} />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((item) => (
            <SharedItemRow
              key={item.id}
              item={item}
              onStop={() => setItems((rows) => rows.filter((row) => row.id !== item.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const MEMBERS = [
  { id: 'm1', name: 'Efa Dibble', role: 'Admin' },
  { id: 'm2', name: 'Kara Voss', role: '' },
  { id: 'm3', name: 'Tomas Reyne', role: '' },
];

function MembersTab({ approval }: { approval: boolean }) {
  const [pending, setPending] = useState(approval ? ['Mira Solen', 'Jax Orrin'] : []);
  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <section aria-label="Pending requests" className="space-y-1">
          <h3 className="text-xs font-semibold">Waiting to join · {pending.length}</h3>
          <ul className="divide-y divide-line">
            {pending.map((name) => (
              <li key={name} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setPending((rows) => rows.filter((row) => row !== name))}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPending((rows) => rows.filter((row) => row !== name))}
                >
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Members" className="space-y-1">
        <h3 className="text-xs font-semibold">Members · {MEMBERS.length}</h3>
        <ul className="divide-y divide-line">
          {MEMBERS.map((member) => (
            <li key={member.id} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{member.name}</span>
              {member.role && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-text-dim">
                  {member.role}
                </span>
              )}
              {!member.role && (
                <>
                  <Button size="sm">Make admin</Button>
                  <Button size="sm" variant="danger">
                    Remove
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function InvitesTab({
  approval,
  setApproval,
}: {
  approval: boolean;
  setApproval: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex min-h-8 items-start gap-2 text-xs">
        <Checkbox checked={approval} onChange={(event) => setApproval(event.target.checked)} />
        <span>
          <span className="block font-medium">Approve new members</span>
          <span className="block text-text-dim">
            Anyone with the link or a mail invite waits in Members until you accept them.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs">
          https://neocom.desk/communities/join/k7Qx2m
        </code>
        <Button size="sm" variant="primary">
          Copy link
        </Button>
        <Button size="sm">Regenerate</Button>
        <Button size="sm">Revoke</Button>
      </div>
      <div className="flex items-center gap-2">
        <SearchInput
          className="min-w-40 flex-1"
          placeholder="Invite by character name (sent as in-game mail)"
          aria-label="Invite by character name"
        />
        <Button size="sm">Send invite</Button>
      </div>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  const tabsId = useTabsId();
  const [top, setTop] = useState('sharing');
  const [approval, setApproval] = useState(true);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <PageHeader title="Communities" />
      <Panel title="Dibble Industries" meta="3 members · 2 waiting">
        <Tabs
          tabsId={tabsId}
          label="Community"
          value={top}
          onChange={setTop}
          tabs={[
            { id: 'sharing', label: 'Sharing' },
            { id: 'members', label: 'Members (2 waiting)' },
            { id: 'invites', label: 'Invites' },
          ]}
        />
        <TabPanel tabsId={tabsId} tabId={top} className="pt-3">
          {top === 'sharing' && children}
          {top === 'members' && <MembersTab approval={approval} />}
          {top === 'invites' && <InvitesTab approval={approval} setApproval={setApproval} />}
        </TabPanel>
        <p className="mt-3 text-xs text-text-dim">
          Members and Invites show for admins only; other members see Sharing and a read-only list.
        </p>
      </Panel>
    </div>
  );
}

function OptionTabs() {
  const tabsId = useTabsId();
  const [tab, setTab] = useState('blueprints');
  const [approval, setApproval] = useState(true);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <PageHeader title="Communities" />
      <Panel title="Dibble Industries" meta="3 members · 2 waiting">
        <p className="mb-2 text-xs text-text-dim">
          Efa Dibble shares nothing until you choose. Your choices apply to this Community only.
        </p>
        <Tabs
          tabsId={tabsId}
          label="Community"
          value={tab}
          onChange={setTab}
          tabs={[
            ...(Object.keys(KIND_LABEL) as Kind[]).map((id) => ({ id, label: KIND_LABEL[id] })),
            { id: 'members', label: 'Members · 2 waiting' },
            { id: 'invites', label: 'Invites' },
          ]}
        />
        <TabPanel tabsId={tabsId} tabId={tab} className="pt-3">
          {tab === 'members' ? (
            <MembersTab approval={approval} />
          ) : tab === 'invites' ? (
            <InvitesTab approval={approval} setApproval={setApproval} />
          ) : (
            <KindSection key={tab} kind={tab as Kind} />
          )}
        </TabPanel>
        <p className="mt-3 text-xs text-text-dim">
          Members and Invites show for admins only; other members see the first three tabs and a
          read-only member list.
        </p>
      </Panel>
    </div>
  );
}

function OptionStacked() {
  return (
    <Page>
      <div className="space-y-4">
        {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
          <section key={kind} aria-label={KIND_LABEL[kind]} className="space-y-2">
            <h3 className="text-xs font-semibold">{KIND_LABEL[kind]}</h3>
            <KindSection kind={kind} />
          </section>
        ))}
      </div>
    </Page>
  );
}

function OptionOneList() {
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const kinds: Kind[] = filter === 'all' ? ['fittings', 'blueprints', 'plans'] : [filter];
  const rows = kinds.flatMap((kind) => ITEMS[kind].map((item) => ({ kind, item })));
  return (
    <Page>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'fittings', label: 'Fittings' },
            { value: 'blueprints', label: 'Blueprints' },
            { value: 'plans', label: 'Skill plans' },
          ]}
        />
        <NewComponent name="AddSharedItem (any kind)">
          <Button size="sm">Share something…</Button>
        </NewComponent>
      </div>
      <p className="mb-2 text-xs text-text-dim">
        Sharing all fittings and all blueprints. Skill plans are listed one by one.
      </p>
      <BrowseBlueprintsLink />
      <ul className="divide-y divide-line">
        {rows.map(({ kind, item }) => (
          <li key={item.id} className="flex items-center gap-2 py-1.5 text-xs">
            <span className="w-20 shrink-0 text-text-dim">{KIND_LABEL[kind]}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
            <Button size="sm">Stop sharing</Button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

const meta = {
  title: 'mockups/Communities',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/communities' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Option A: a tab per kind (Fittings, Blueprints, Skill plans), each with share-all, search-to-add and a revoke list. New components: ShareScopeRow, SharedItemRow, AddSharedItem, BrowseBlueprintsLink. */
export const OptionATabs: Story = { render: () => <OptionTabs /> };

/** @summary Option B: all three kinds stacked on one page, each with its own share-all, search-to-add and list. */
export const OptionBStacked: Story = { render: () => <OptionStacked /> };

/** @summary Option C: one combined list with a kind filter and a single Share something button. New component: AddSharedItem (any kind). */
export const OptionCOneList: Story = { render: () => <OptionOneList /> };

/** @summary Option A in the phone shell. */
export const OptionATabsPhone: Story = {
  render: () => <OptionTabs />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Option B in the phone shell. */
export const OptionBStackedPhone: Story = {
  render: () => <OptionStacked />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Option C in the phone shell. */
export const OptionCOneListPhone: Story = {
  render: () => <OptionOneList />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
