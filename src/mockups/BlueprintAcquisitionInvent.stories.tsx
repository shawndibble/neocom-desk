import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  Modal,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import { formatIsk } from '@/lib/isk';
import { TRADE_HUBS } from '@/market/hubs';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T9b): the Blueprint Acquisition modal, opened on a T2 plan's
 * blueprint, gains an "Invent" section beside Owned tiers · Contracts ·
 * Market · LP Store · Manual tier. It states what one invention attempt costs
 * (datacores by name × quantity × price, the T1 copy job, the invention job
 * fee), the success chance from the Character's skills, and one row per
 * decryptor choice ("No decryptor" plus each decryptor, as tiers), each with
 * its chance, resulting ME/TE/runs and expected cost per run, and the same
 * "Use this blueprint" button every other row has. The cheapest row is marked
 * and picked automatically; picking another overrides it. Expected cost per
 * run = attempt cost ÷ chance ÷ runs per copy, labelled "expected".
 *
 * The modal is drawn from its real parts (Modal, Select, IconButton, the
 * same section, heading and row classes) over sample sections, so the
 * Contracts row can show invention winning on price. Market and LP Store show
 * their real empty lines, as they do for most T2 blueprints.
 *
 * New components in this mockup: `InventSection` (the whole section: cost
 * facts and the decryptor tier rows). Everything else is the existing modal.
 */

const HEADING_CLASS = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';
const SECTION_CLASS = 'flex flex-col gap-2 border-t border-line pt-3';

const BLUEPRINT = 'Gyrostabilizer II Blueprint';

interface Datacore {
  name: string;
  qty: number;
  price: number;
}

const DATACORES: Datacore[] = [
  { name: 'Datacore - Mechanical Engineering', qty: 8, price: 285_000 },
  { name: 'Datacore - Minmatar Starship Engineering', qty: 8, price: 262_000 },
];
const COPY_JOB = 18_400;
const INVENTION_FEE = 525_600;
const BASE_CHANCE = 0.41;
const BASE = { me: 2, te: 4, runs: 10 };
const ATTEMPT_BASE =
  DATACORES.reduce((sum, d) => sum + d.qty * d.price, 0) + COPY_JOB + INVENTION_FEE;

interface Decryptor {
  name: string | null;
  price: number;
  chance: number;
  me: number;
  te: number;
  runs: number;
}

const DECRYPTORS: Decryptor[] = [
  { name: null, price: 0, chance: 1, me: 0, te: 0, runs: 0 },
  { name: 'Accelerant Decryptor', price: 1_050_000, chance: 1.2, me: 2, te: 10, runs: 1 },
  { name: 'Attainment Decryptor', price: 3_900_000, chance: 1.8, me: -1, te: 4, runs: 4 },
  { name: 'Augmentation Decryptor', price: 1_300_000, chance: 0.6, me: -2, te: 2, runs: 9 },
  {
    name: 'Optimized Attainment Decryptor',
    price: 2_400_000,
    chance: 1.9,
    me: 1,
    te: -2,
    runs: 2,
  },
  {
    name: 'Optimized Augmentation Decryptor',
    price: 9_800_000,
    chance: 0.9,
    me: 2,
    te: 0,
    runs: 7,
  },
  { name: 'Parity Decryptor', price: 1_600_000, chance: 1.5, me: 1, te: -2, runs: 3 },
  { name: 'Process Decryptor', price: 1_250_000, chance: 1.1, me: 3, te: 6, runs: 0 },
  { name: 'Symmetry Decryptor', price: 1_450_000, chance: 1, me: 1, te: 8, runs: 2 },
];

interface InventTier {
  key: string;
  label: string;
  chance: number;
  me: number;
  te: number;
  runs: number;
  attempt: number;
  perRun: number;
}

const TIERS: InventTier[] = DECRYPTORS.map((d) => {
  const chance = BASE_CHANCE * d.chance;
  const runs = BASE.runs + d.runs;
  const attempt = ATTEMPT_BASE + d.price;
  return {
    key: d.name ?? 'none',
    label: d.name === null ? 'No decryptor' : `${d.name} (${formatIsk(d.price)} ISK)`,
    chance,
    me: BASE.me + d.me,
    te: BASE.te + d.te,
    runs,
    attempt,
    perRun: Math.round(attempt / chance / runs),
  };
});
const CHEAPEST_TIER = TIERS.reduce((best, tier) => (tier.perRun < best.perRun ? tier : best));

function pct(chance: number) {
  return `${(chance * 100).toFixed(chance * 100 >= 10 ? 1 : 2).replace(/\.0$/, '')}%`;
}

/** One source row: facts, tags, and the pick button — the modal's own row grammar. */
function SourceRow({
  summary,
  cheapest = false,
  tags = [],
}: {
  summary: ReactNode;
  cheapest?: boolean;
  tags?: string[];
}) {
  const { t } = useTranslation();
  const allTags = [...(cheapest ? [t('industry.bpAcqCheapest')] : []), ...tags];
  return (
    <li
      className={`flex items-start justify-between gap-2 rounded-xs px-1 py-0.5 ${cheapest ? 'bg-panel-2' : ''}`}
    >
      <span className="min-w-0 flex-1 break-words">
        {summary}
        {allTags.map((tag) => (
          <span
            key={tag}
            className="ml-1.5 inline-block text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase"
          >
            {tag}
          </span>
        ))}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <IconButton
          size="sm"
          icon={<Icon.Select />}
          label={t('industry.bpAcqUseRow', {
            row: typeof summary === 'string' ? summary : BLUEPRINT,
          })}
          tooltip={t('industry.bpAcqUse')}
        />
      </span>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-dim">{label}</dt>
      <dd className="min-w-0 tabular-nums">{children}</dd>
    </>
  );
}

function InventSection() {
  const { t } = useTranslation();
  const tier = (row: { me: number; te: number }) =>
    t('industry.blueprintAcquisitionTier', { me: row.me, te: row.te });
  return (
    <section className={SECTION_CLASS}>
      <NewComponent name="InventSection">
        <div className="flex flex-col gap-2">
          <h3 className={HEADING_CLASS}>Invent</h3>
          <p className="text-text-dim">
            Invent a copy from Gyrostabilizer I Blueprint. One attempt costs the datacores, a 1-run
            T1 copy and the invention job. Expected cost per run = attempt cost ÷ success chance ÷
            runs per copy.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <Fact label="Datacores">
              <ul className="flex flex-col">
                {DATACORES.map((d) => (
                  <li key={d.name}>
                    {d.name} × {d.qty} × {formatIsk(d.price)} ={' '}
                    {t('industry.bpAcqIsk', { isk: formatIsk(d.qty * d.price) })}
                  </li>
                ))}
              </ul>
            </Fact>
            <Fact label="T1 copy job">
              {t('industry.bpAcqIsk', { isk: formatIsk(COPY_JOB) })} · Gyrostabilizer I Blueprint, 1
              run
            </Fact>
            <Fact label="Invention job fee">
              {t('industry.bpAcqIsk', { isk: formatIsk(INVENTION_FEE) })}
            </Fact>
            <Fact label="Success chance">
              {pct(BASE_CHANCE)}{' '}
              <HintText content="Kestrel Vane: Mechanical Engineering IV, Minmatar Starship Engineering IV, Minmatar Encryption Methods III">
                from your skills
              </HintText>
            </Fact>
            <Fact label="Attempt cost">
              {t('industry.bpAcqIsk', { isk: formatIsk(ATTEMPT_BASE) })}, before a decryptor
            </Fact>
          </dl>
          <ul className="flex flex-col gap-1">
            {TIERS.map((row) => (
              <SourceRow
                key={row.key}
                cheapest={row === CHEAPEST_TIER}
                summary={[
                  row.label,
                  pct(row.chance),
                  tier(row),
                  `${row.runs} runs`,
                  `Expected cost per run ${formatIsk(row.perRun)} ISK`,
                ].join(' · ')}
              />
            ))}
          </ul>
        </div>
      </NewComponent>
    </section>
  );
}

function AcquisitionModal({ proposed }: { proposed: boolean }) {
  const { t } = useTranslation();
  const isk = (value: number) => t('industry.bpAcqIsk', { isk: formatIsk(value) });
  const tier = (me: number, te: number) => t('industry.blueprintAcquisitionTier', { me, te });
  const contractRows = [
    [
      t('industry.bpAcqCopyRuns', { count: 10 }),
      tier(2, 4),
      isk(16_500_000),
      t('industry.bpAcqIskPerRun', { isk: formatIsk(1_650_000) }),
      'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    ].join(' · '),
    [
      t('industry.bpAcqCopyRuns', { count: 5 }),
      tier(4, 14),
      isk(9_250_000),
      t('industry.bpAcqIskPerRun', { isk: formatIsk(1_850_000) }),
      'Perimeter II - Moon 1 - Caldari Navy Assembly Plant',
    ].join(' · '),
  ];
  return (
    <Modal
      open
      onClose={() => undefined}
      title={t('industry.blueprintAcquisitionModalTitle', { name: BLUEPRINT })}
    >
      <div className="flex flex-col gap-4 text-xs">
        <div className="flex flex-col gap-1">
          <span>{t('industry.bpAcqHubLabel')}</span>
          <Select value="jita">
            <SelectTrigger size="sm" aria-label={t('industry.bpAcqHubLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRADE_HUBS.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-text-dim">{t('industry.bpAcqHubHint')}</span>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className={HEADING_CLASS}>{t('industry.blueprintAcquisitionOwnedTiers')}</h3>
          <p className="text-text-dim">{t('industry.blueprintAcquisitionNoOwnedTiers')}</p>
        </section>

        <section className={SECTION_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={HEADING_CLASS}>{t('industry.bpAcqContractsHeading')}</h3>
            <Select value="hub">
              <SelectTrigger size="sm" aria-label={t('industry.bpAcqContractRegion')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hub">The Forge</SelectItem>
                <SelectItem value="all">{t('industry.bpAcqAllRegions')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ul className="flex flex-col gap-1">
            {contractRows.map((summary, i) => (
              <SourceRow key={summary} summary={summary} cheapest={!proposed && i === 0} />
            ))}
          </ul>
          <Button size="sm" variant="ghost">
            <Icon.Search /> {t('industry.bpAcqSeeAll')}
          </Button>
        </section>

        <section className={SECTION_CLASS}>
          <h3 className={HEADING_CLASS}>{t('industry.bpAcqMarketHeading')}</h3>
          <p className="text-text-dim">{t('industry.bpAcqMarketHint')}</p>
          <p className="text-text-dim">
            {t('industry.bpAcqNoSellOrders', { region: 'The Forge' })}
          </p>
        </section>

        <section className={SECTION_CLASS}>
          <h3 className={HEADING_CLASS}>{t('industry.blueprintAcquisitionLpHeading')}</h3>
          <p className="text-text-dim">{t('industry.bpAcqNoLpOffers')}</p>
        </section>

        {proposed && <InventSection />}

        <section className={SECTION_CLASS}>
          <h3 className={HEADING_CLASS}>{t('industry.blueprintAcquisitionManualHeading')}</h3>
          <p className="text-text-dim">{t('industry.blueprintAcquisitionManualHint')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualMe')}
              <TextInput size="sm" className="w-16" inputMode="numeric" defaultValue="0" />
            </label>
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualTe')}
              <TextInput size="sm" className="w-16" inputMode="numeric" defaultValue="0" />
            </label>
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualPrice')}
              <TextInput size="sm" className="w-28" inputMode="decimal" />
            </label>
            <IconButton
              icon={<Icon.Select />}
              label={t('industry.bpAcqUseRow', {
                row: t('industry.blueprintAcquisitionManualHeading'),
              })}
              tooltip={t('industry.bpAcqUse')}
            />
          </div>
        </section>
      </div>
    </Modal>
  );
}

function PlanBehind({ proposed }: { proposed: boolean }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Gyrostabilizer II" />
      <AcquisitionModal proposed={proposed} />
    </div>
  );
}

const meta = {
  title: 'mockups/BlueprintAcquisitionInvent',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/industry/plans' } },
  render: () => <PlanBehind proposed />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Proposed Blueprint Acquisition modal on a T2 plan with an Invent section: datacores, copy job, job fee, chance from skills, one row per decryptor, expected cost per run. New component: InventSection. */
export const Proposed: Story = {};

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Today's modal on the same T2 blueprint: Owned, Contracts, Market, LP Store, Manual, no Invent. */
export const Today: Story = {
  render: () => <PlanBehind proposed={false} />,
};

/** @summary Today's modal in the phone shell. */
export const TodayPhone: Story = {
  render: () => <PlanBehind proposed={false} />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
