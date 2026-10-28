import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { Button, Modal, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';
import { Page, SrpHeader, LostShipsTable } from './srpMemberParts';
import { LOST_SHIPS } from './srpMemberFixtures';

/**
 * SRP, member side: the modal that opens when a pilot clicks a ship name in
 * "Or pick a lost ship". Too-old losses are no longer listed. Three layouts
 * for the same content: the killmail (victim, system, time, fit, what it cost)
 * and the claim (hull rule, amount, doctrine check, File).
 *
 * - **A: Claim first**: the answer to "will I be repaid, and how much" is the
 *   top block; the killmail facts and fit sit under it.
 * - **B: Killmail first**: the killmail leads (facts and fit side by side, as
 *   Pilot Lookup shows a loss); the claim is a pinned footer with the amount.
 * - **C: Fit against doctrine**: the fit is checked line by line against the
 *   corp's Doctrine Fit, so the pilot sees a doctrine problem before filing.
 *
 * All three open as a centered dialog on desktop and a bottom sheet on a phone.
 *
 * New components in this mockup: `PayoutSummary` (A), `KillmailFacts` (B),
 * `DoctrineFitCheck` (C). Everything else is `Modal`, `Button`, `Pill`.
 */
const meta = {
  title: 'mockups/SrpKillmail',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: { path: '/corp/moons' },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SHIP = {
  hull: 'Hurricane Fleet Issue',
  system: 'Ignoitton (0.4)',
  time: '22 Oct 2026, 20:05',
  value: 187_000_000,
  hullValue: 71_000_000,
  fitValue: 116_000_000,
  attackers: 6,
  finalBlow: 'Kestrel Vane · Gila',
  rule: 'Hull Rule: Hurricane Fleet Issue, 70% of killmail value',
  amount: 130_900_000,
};

const FIT: { slot: string; items: string[] }[] = [
  { slot: 'High', items: ['720mm Howitzer Artillery II ×6', 'Core Probe Launcher I'] },
  {
    slot: 'Mid',
    items: ['Large Shield Extender II', 'Adaptive Invulnerability Field II', 'Stasis Webifier II'],
  },
  { slot: 'Low', items: ['Gyrostabilizer II ×3', 'Damage Control II', 'Reactor Control Unit II'] },
  {
    slot: 'Rig',
    items: ['Large Projectile Burst Aerator I', 'Large Core Defense Field Extender I'],
  },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm tabular-nums">
      <dt className="text-text-dim">{label}</dt>
      <dd className="ml-auto text-right">{children}</dd>
    </div>
  );
}

function Facts() {
  return (
    <dl className="space-y-1">
      <Row label="System">{SHIP.system}</Row>
      <Row label="Lost">{SHIP.time}</Row>
      <Row label="Killmail value">{formatIsk(SHIP.value)}</Row>
      <Row label="Hull / fit">
        {formatIsk(SHIP.hullValue)} / {formatIsk(SHIP.fitValue)}
      </Row>
      <Row label="Attackers">
        {SHIP.attackers} · final blow {SHIP.finalBlow}
      </Row>
    </dl>
  );
}

function Fit({ flag }: { flag?: (item: string) => 'ok' | 'off' | null }) {
  return (
    <div className="space-y-2">
      {FIT.map((g) => (
        <div key={g.slot}>
          <div className="text-xs uppercase tracking-wide text-text-dim">{g.slot}</div>
          <ul className="text-sm">
            {g.items.map((item) => {
              const f = flag?.(item) ?? null;
              return (
                <li key={item} className="flex items-baseline gap-2">
                  <span>{item}</span>
                  {f === 'ok' && <Pill tone="success">Doctrine</Pill>}
                  {f === 'off' && <Pill tone="warning">Off doctrine</Pill>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FileButtons() {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" className="w-full sm:w-auto">
        Close
      </Button>
      <Button variant="primary" className="w-full sm:w-auto">
        File claim
      </Button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <Page>
      <SrpHeader />
      <LostShipsTable ships={LOST_SHIPS.filter((s) => s.kind !== 'old')} />
      {children}
    </Page>
  );
}

function Dialog({ footer, children }: { footer: ReactNode; children: ReactNode }) {
  const phone = useIsPhone();
  return (
    <Modal
      open
      onClose={() => undefined}
      placement={phone ? 'sheet' : 'center'}
      title={SHIP.hull}
      footer={footer}
    >
      {children}
    </Modal>
  );
}

/** @summary A: the payout answer first, killmail and fit underneath. */
export const ClaimFirst: Story = {
  render: () => (
    <Shell>
      <Dialog footer={<FileButtons />}>
        <div className="space-y-4">
          <NewComponent name="PayoutSummary">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{formatIsk(SHIP.amount)}</span>
              <Pill tone="success">Covered</Pill>
            </div>
            <p className="mt-1 text-xs text-text-dim">{SHIP.rule}</p>
            <p className="text-xs text-text-dim">Fit matches your corp's doctrine. 1 day old.</p>
          </NewComponent>
          <Facts />
          <Fit />
        </div>
      </Dialog>
    </Shell>
  ),
};

/** @summary B: killmail leads in two columns; the amount rides in the footer. */
export const KillmailFirst: Story = {
  render: () => (
    <Shell>
      <Dialog
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm tabular-nums">
              <span className="text-text-dim">You would be repaid </span>
              <b>{formatIsk(SHIP.amount)}</b>
            </span>
            <div className="sm:ml-auto">
              <FileButtons />
            </div>
          </div>
        }
      >
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <NewComponent name="KillmailFacts">
            <Facts />
          </NewComponent>
          <Fit />
        </div>
      </Dialog>
    </Shell>
  ),
};

/** @summary C: the fit checked against the doctrine, line by line. */
export const FitAgainstDoctrine: Story = {
  render: () => (
    <Shell>
      <Dialog footer={<FileButtons />}>
        <div className="space-y-4">
          <p className="text-sm text-text-dim">
            Checked against <b className="text-text">Tuesday Hurricane FI</b>: 1 module off
            doctrine. You can still file; an officer will see this.
          </p>
          <NewComponent name="DoctrineFitCheck">
            <Fit
              flag={(item) =>
                item.startsWith('Reactor') ? 'off' : item.startsWith('Core Probe') ? null : 'ok'
              }
            />
          </NewComponent>
          <Facts />
          <p className="text-sm tabular-nums">
            <span className="text-text-dim">Payout </span>
            <b>{formatIsk(SHIP.amount)}</b>
            <span className="text-text-dim"> · {SHIP.rule}</span>
          </p>
        </div>
      </Dialog>
    </Shell>
  ),
};

const phone = { globals: { viewport: { value: 'phone390', isRotated: false } } };
/** @summary A on a phone: bottom sheet. */
export const ClaimFirstPhone: Story = { ...ClaimFirst, ...phone };
/** @summary B on a phone: single column, amount above the buttons. */
export const KillmailFirstPhone: Story = { ...KillmailFirst, ...phone };
/** @summary C on a phone: bottom sheet. */
export const FitAgainstDoctrinePhone: Story = { ...FitAgainstDoctrine, ...phone };

function DoctrineMark({ ok }: { ok: boolean }) {
  return (
    <Tooltip content={ok ? 'Doctrine' : 'Off doctrine'}>
      <span
        role="img"
        aria-label={ok ? 'Doctrine' : 'Off doctrine'}
        tabIndex={0}
        className={cx('ml-auto', ok ? 'text-success' : 'text-warning')}
      >
        {ok ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        ) : (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        )}
      </span>
    </Tooltip>
  );
}

function CheckedFit() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">
        Fit checked against <b className="text-text">Tuesday Hurricane FI</b>
      </p>
      {FIT.map((g) => (
        <div key={g.slot}>
          <div className="text-xs uppercase tracking-wide text-text-dim">{g.slot}</div>
          <ul className="text-sm">
            {g.items.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span>{item}</span>
                {item.startsWith('Core Probe') ? null : (
                  <DoctrineMark ok={!item.startsWith('Reactor')} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * A and C combined: the payout answer on top, then two columns, killmail facts
 * on the left and the fit checked against the doctrine on the right. A green
 * check marks a doctrine module, a yellow exclamation an off-doctrine one; each
 * has a tooltip ("Doctrine", "Off doctrine") and an accessible name. A module
 * the doctrine doesn't cover (the probe launcher) has no mark.
 *
 * New components in this mockup: `PayoutSummary`, `KillmailFacts`,
 * `DoctrineMark` (a `Tooltip` around `Icon.Done` / `Icon.Warn`).
 *
 * @summary Combined: payout on top, facts left, doctrine-checked fit right.
 */
export const Combined: Story = {
  render: () => (
    <Shell>
      <Modal
        open
        onClose={() => undefined}
        placement="medium"
        title={SHIP.hull}
        footer={<FileButtons />}
      >
        <div className="space-y-4">
          <NewComponent name="PayoutSummary">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{formatIsk(SHIP.amount)}</span>
              <Pill tone="success">Covered</Pill>
            </div>
            <p className="mt-1 text-xs text-text-dim">{SHIP.rule}</p>
            <p className="flex items-center gap-1 text-xs text-warning">
              <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />1 module off doctrine. You
              can still file; an officer will see this.
            </p>
          </NewComponent>
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <NewComponent name="KillmailFacts">
              <Facts />
            </NewComponent>
            <CheckedFit />
          </div>
        </div>
      </Modal>
    </Shell>
  ),
};
