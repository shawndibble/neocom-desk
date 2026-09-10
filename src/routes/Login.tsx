import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BootScreen } from '@/app/BootScreen';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { db } from '@/db';
import {
  DataAgeBadge,
  LogoMark,
  Panel,
  SEVERITY_TEXT,
  SeverityIcon,
  Spinner,
  StatChip,
} from '@/components/ui';
import { characterAvatarBoxClassName } from '@/components/ui/characterAvatarBox';
import {
  Clones,
  Container,
  Corporation,
  ICON_SIZE,
  Industry,
  Market,
  MoonMining,
  Notifications,
  Offline,
  OpenSource,
  Orders,
  Planetary,
  ReadOnly,
  ScheduledPush,
  SignIn,
  Skills,
  Social,
  TokenPrivacy,
  Wallet,
  type IconProps,
} from '@/components/ui/icons';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import { MINUTE_MS } from '@/lib/age';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { REPO_URL } from '@/lib/links';
import type { DeadlineSeverity } from '@/engine/severity';

/**
 * One illustrated row of landing copy: a glyph, and the `login.*` sub-key its
 * words live under. Every list on this page is a list of these — the shapes
 * differ only in which strings they read off the key.
 */
interface LandingRow {
  icon: ComponentType<IconProps>;
  key: string;
}

/**
 * The four questions the page leads with. Each one names a surface a signed-in
 * pilot actually opens, so the claim under it can be checked against the app
 * rather than admired — no benefit here is broader than what ships.
 */
const ANSWERS: LandingRow[] = [
  { icon: Orders, key: 'orders' },
  { icon: Industry, key: 'build' },
  { icon: Skills, key: 'training' },
  { icon: MoonMining, key: 'moon' },
];

/**
 * The feature catalog under the answers, grouped the way the app's own nav
 * groups its routes (Progression / Economy / Operations) so the page and the
 * signed-in shell describe the same product in the same order.
 */
const FEATURE_GROUPS: { group: string; items: LandingRow[] }[] = [
  {
    group: 'progression',
    items: [
      { icon: Skills, key: 'skills' },
      { icon: Clones, key: 'clones' },
    ],
  },
  {
    group: 'economy',
    items: [
      { icon: Industry, key: 'industry' },
      { icon: Market, key: 'market' },
      { icon: Orders, key: 'orders' },
      { icon: Wallet, key: 'walletOrders' },
      { icon: Container, key: 'assets' },
      { icon: Planetary, key: 'planetary' },
      { icon: MoonMining, key: 'miningTax' },
    ],
  },
  {
    group: 'operations',
    items: [
      { icon: Corporation, key: 'corp' },
      // Alerts is the record of what fired; Notifications is how it gets to
      // you. Two rows because the app splits them too — Alerts is a nav route,
      // Notifications is a Settings panel plus the push path — and the bell
      // belongs to the feed you read rather than to the delivery mechanism.
      { icon: Notifications, key: 'alerts' },
      { icon: ScheduledPush, key: 'notifications' },
      { icon: Social, key: 'social' },
    ],
  },
];

/**
 * The objections a pilot weighs before handing an EVE SSO grant to a
 * third-party site. Deliberately the last thing above the closing button —
 * it is where the hesitation actually happens.
 */
const TRUST: LandingRow[] = [
  { icon: ReadOnly, key: 'readOnly' },
  { icon: TokenPrivacy, key: 'token' },
  { icon: Offline, key: 'offline' },
  { icon: OpenSource, key: 'openSource' },
];

/**
 * Sample values for the hero preview only — never real character data.
 *
 * The figures are the approved board mockup's own (`design/overview-triage`,
 * tagged), so the landing page and the design that shipped tell one story: a
 * reset run as the next deadline, 27 orders needing work, 70 unread alerts.
 */
const PREVIEW = {
  name: 'Aurelia Vex',
  totalSp: (84_213_904).toLocaleString(),
  unallocatedSp: (12_500).toLocaleString(),
  wallet: 1_234_567_890.12,
  // No roman-numeral level here: the real Overview page's active-training
  // line names the skill alone (Overview.tsx reads catalog skill names,
  // never a level-suffixed one) — matching that exactly, not just its shape.
  trainingSkill: 'Gunnery',
  /** The soonest clock on the board. A colony reset run, as on the mockup. */
  deadlineSeconds: 3 * 3600 + 12 * 60,
  deadlineColonies: 4,
  trainingSeconds: 86_400 + 4 * 3600 + 20 * 60,
  queued: 6,
  orders: {
    needWork: 27,
    undercut: 21,
    outbid: 4,
    relist: 2,
    belowFloor: 2,
    used: 24,
    slots: 41,
  },
  alerts: 70,
};

/** Landing page for signed-out users: what Neocom Desk does, and the EVE SSO login button. */
export function Login() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  // Wall-clock reads for illustrative "how fresh is this" values in the
  // static preview panel — same class of impurity Overview.tsx and
  // NotificationFeedPanel.tsx already accept for the real thing. Lazy
  // initializers run once on mount rather than every render.
  const [previewFetchedAt] = useState(() => new Date(Date.now() - 2 * MINUTE_MS));

  // Bookmark/back-button case: a Character already exists, so the marketing
  // page is not the right thing to show — mirror App.tsx's root gate.
  const characterCount = useLiveQuery(() => db.characters.count());

  function onLogin() {
    setPending(true);
    // The add-a-character branch: nobody is signed in yet, so there is no
    // grant to union with and the base set is the whole request (#295).
    void beginAddCharacterLogin().catch(() => setPending(false));
  }

  if (characterCount === undefined) return <BootScreen />;
  if (characterCount > 0) return <Navigate to="/characters" replace />;

  return (
    <main className="bg-bg text-text">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-4">
          <LogoMark className="size-7" />
          <span className="text-sm font-bold tracking-wide">{t('app.name')}</span>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-accent uppercase">
            {t('login.eyebrow')}
          </p>
          <h1 className="mt-3 text-3xl leading-tight font-semibold text-balance sm:text-4xl">
            {t('login.heading')}
          </h1>
          <p className="mt-4 max-w-md text-text-dim">{t('app.tagline')}</p>
          <div className="mt-7 flex flex-col items-start gap-3">
            <SsoButton pending={pending} onClick={onLogin} label={t('login.button')} />
            <span className="text-xs text-text-dim">{t('login.trustLine')}</span>
          </div>
        </div>

        <div
          role="group"
          aria-labelledby="login-preview-label"
          className="relative rounded-xs border border-line bg-panel/85 p-4 shadow-[0_0_60px_-20px_rgba(87,199,244,0.25)] backdrop-blur-sm"
        >
          <span
            id="login-preview-label"
            className="absolute -top-3 right-4 bg-bg px-1.5 text-[0.625rem] tracking-widest text-text-faint uppercase"
          >
            {t('login.previewLabel')}
          </span>

          <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
            <div
              aria-hidden="true"
              className={`${characterAvatarBoxClassName('lg')} border-line bg-panel-2`}
            />
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-sm font-semibold tracking-widest uppercase">
                {PREVIEW.name}
              </p>
              <p className="truncate text-xs text-text-dim">{t('login.previewCorp')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatChip label={t('skills.totalSp')} value={PREVIEW.totalSp} />
              <StatChip label={t('skills.unallocatedSp')} value={PREVIEW.unallocatedSp} />
            </div>
          </div>

          <div className={`${tabScrollerClassName} mt-3`}>
            <div className={tabListClassName}>
              <span className={`${tabItemClassName} ${tabItemActiveClassName}`}>
                {t('nav.overview')}
              </span>
              <span className={`${tabItemClassName} ${tabItemIdleClassName}`}>
                {t('nav.clones')}
              </span>
              <span className={`${tabItemClassName} ${tabItemIdleClassName}`}>
                {t('nav.employmentHistory')}
              </span>
            </div>
          </div>

          {/*
            The board at the width this column has: the summary strip, one full
            card, and alerts folded to a single line. That is the phone board's
            own shape rather than an invention — `Overview.tsx` folds the alerts
            row and keeps the cards when it is narrow — so the preview shows a
            layout the app really renders instead of a desktop board squeezed
            until it stops being one.

            Every label is read from `overview.board.*`, the same keys the real
            board renders. The three panels this replaced still called
            `overview.queue`, `overview.notifications`, `overview.training` and
            `overview.finishes`, all four deleted when the Overview became a
            triage board, so a signed-out visitor was being shown the literal
            string `overview.queue`. Sharing the board's keys is what makes that
            failure impossible rather than merely fixed once.
          */}
          <div className="mt-3 flex flex-col gap-2">
            <div className="rounded-xs border border-line bg-panel-2/50 p-3">
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <PreviewCell label={t('overview.board.nextDeadline')}>
                  <p
                    className={`text-2xl leading-tight font-medium tabular-nums ${SEVERITY_TEXT.warning}`}
                  >
                    {formatDuration(PREVIEW.deadlineSeconds)}
                  </p>
                  <p className="truncate text-xs text-text-dim">
                    {t('overview.board.batch.running', { count: PREVIEW.deadlineColonies })}
                  </p>
                </PreviewCell>

                <PreviewCell label={t('overview.board.trainingNow')}>
                  <p className="text-sm font-medium">{PREVIEW.trainingSkill}</p>
                  <p className="truncate text-xs text-text-dim">
                    {t('overview.timeLeft', {
                      duration: formatDuration(PREVIEW.trainingSeconds),
                    })}
                    {' · '}
                    {t('overview.board.queued', { count: PREVIEW.queued })}
                  </p>
                </PreviewCell>

                <PreviewCell label={t('overview.wallet')}>
                  <p className="text-sm font-medium tabular-nums text-isk-pos">
                    {formatIsk(PREVIEW.wallet, 2)} {t('overview.isk')}
                  </p>
                </PreviewCell>

                <span className="ml-auto shrink-0">
                  <DataAgeBadge date={previewFetchedAt} />
                </span>
              </div>
            </div>

            <Panel
              title={t('overview.board.orders')}
              meta={
                <span className="text-[0.6875rem] text-text-dim">
                  {t('overview.board.ordersMeta', { count: PREVIEW.orders.needWork })}
                </span>
              }
              padded={false}
            >
              <div className="flex gap-2 p-3">
                <PreviewTile
                  label={t('overview.board.undercut')}
                  value={PREVIEW.orders.undercut}
                  severity="warning"
                />
                <PreviewTile
                  label={t('overview.board.outbid')}
                  value={PREVIEW.orders.outbid}
                  severity="warning"
                />
                <PreviewTile
                  label={t('overview.board.relist')}
                  value={PREVIEW.orders.relist}
                  severity="watch"
                />
              </div>
              {/* Below-floor keeps the danger tone it carries on the real card:
                  it is the one order problem losing ISK now rather than losing
                  the sale. */}
              <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                <span className="text-danger">
                  {t('overview.board.belowFloor', { count: PREVIEW.orders.belowFloor })}
                </span>
                {` · ${t('overview.board.slotsUsed', {
                  used: PREVIEW.orders.used,
                  total: PREVIEW.orders.slots,
                })}`}
              </p>
            </Panel>

            <Panel padded={false}>
              <div className="flex items-center gap-2 px-3 py-2">
                <SeverityIcon severity="warning" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {t('overview.board.alerts')}
                </span>
                <span className="shrink-0 text-[0.6875rem] whitespace-nowrap text-text-dim">
                  {t('overview.board.alertsUnread', { count: PREVIEW.alerts })}
                </span>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <LandingSection id="login-answers" heading={t('login.answersHeading')}>
        <p className="mt-2 max-w-2xl text-sm text-text-dim">{t('login.answersLead')}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {ANSWERS.map(({ icon: Icon, key }) => (
            // Untitled Panels: `Panel`'s own `title` is the uppercase
            // micro-heading, and a question is the one heading on this page
            // that has to read at body size to be worth asking.
            <Panel key={key}>
              <div className="flex items-start gap-3">
                <Icon size={ICON_SIZE.lg} className="mt-0.5 shrink-0 text-accent" />
                <h3 className="text-base font-semibold text-balance">
                  {t(`login.answers.${key}.question`)}
                </h3>
              </div>
              <p className="mt-3 text-sm text-text-dim">{t(`login.answers.${key}.answer`)}</p>
            </Panel>
          ))}
        </div>
      </LandingSection>

      <LandingSection id="login-features" heading={t('login.featuresHeading')}>
        {FEATURE_GROUPS.map(({ group, items }) => (
          <div key={group} className="mt-6">
            <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t(`login.featureGroups.${group}`)}
            </h3>
            <div className="mt-2 border-t border-line">
              {items.map(({ icon: Icon, key }) => (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-4 border-b border-line py-4"
                >
                  <Icon size={ICON_SIZE.lg} className="shrink-0 text-accent" />
                  <span className="w-44 shrink-0 text-sm font-semibold">
                    {t(`login.features.${key}.name`)}
                  </span>
                  <span className="flex-1 basis-64 text-sm text-text-dim">
                    {t(`login.features.${key}.desc`)}
                  </span>
                  <span className="rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] text-text-dim">
                    {t(`login.features.${key}.tag`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </LandingSection>

      <LandingSection id="login-trust" heading={t('login.trustHeading')}>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ icon: Icon, key }) => (
            <Panel key={key}>
              <Icon size={ICON_SIZE.lg} className="text-accent" />
              <h3 className="mt-3 text-sm font-semibold">{t(`login.trust.${key}.name`)}</h3>
              <p className="mt-1 text-sm text-text-dim">{t(`login.trust.${key}.desc`)}</p>
            </Panel>
          ))}
        </div>
        {/*
          The full scope enumeration sits here rather than beside the hero
          button: it is what a hesitant reader wants *after* the trust points
          and immediately before the closing CTA, and at hero size it was a
          wall of 11px text nobody read.
        */}
        <p className="mt-6 max-w-4xl text-xs text-text-dim">{t('login.permissionsHint')}</p>
        <p className="mt-2 max-w-4xl text-xs text-text-dim">{t('login.mailWriteException')}</p>
      </LandingSection>

      <section className="border-t border-line px-6 py-14 text-center">
        <h2 className="text-2xl font-semibold">{t('login.bottomCtaHeading')}</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-text-dim">{t('login.bottomCtaBody')}</p>
        <div className="mt-6 flex justify-center">
          <SsoButton pending={pending} onClick={onLogin} label={t('login.button')} />
        </div>
      </section>

      <footer className="flex flex-wrap justify-center gap-6 px-6 py-6 text-xs text-text-dim">
        <span>{t('login.footerMultiChar')}</span>
        <span>{t('login.footerOffline')}</span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text hover:underline"
        >
          {t('login.footerOpenSource')}
        </a>
      </footer>
    </main>
  );
}

/**
 * One titled band of the landing page. Named as a landmark rather than left an
 * anonymous `<section>`: on a page this long, "skip to what it does" and "skip
 * to what it asks for" are real navigation, and the name doubles as the handle
 * a test grabs a section by — several labels here (Clones, Market) also appear
 * in the hero's preview panel, so an unscoped query would be ambiguous.
 */
function LandingSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <h2 id={`${id}-heading`} className="text-xl font-semibold">
          {heading}
        </h2>
        {children}
      </div>
    </section>
  );
}

function SsoButton({
  pending,
  onClick,
  label,
}: {
  pending: boolean;
  onClick: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-xs border border-line-bright bg-black px-5 text-sm font-semibold tracking-wider text-white transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {pending ? (
        <Spinner size="sm" label={t('common.loading')} />
      ) : (
        <SignIn aria-hidden="true" className="text-accent" />
      )}
      {label}
    </button>
  );
}

/**
 * One cell of the preview's summary strip.
 *
 * A sibling of `SummaryStrip`'s own `Cell` rather than an import of it: that
 * component's cells wrap their values in router `Link`s, and every destination
 * on this board is a route a signed-out visitor cannot reach. A mockup that
 * offers live navigation into gated pages is a promise the page cannot keep.
 */
function PreviewCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 basis-36 flex-col gap-0.5">
      <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">{label}</span>
      {children}
    </span>
  );
}

/**
 * One count on the preview's Open orders card — a static `NumberTile`.
 *
 * Same reasoning as `PreviewCell`: the real tile is a `Link` to the Orders
 * page filtered to the rows it counted. It keeps the tone-and-glyph pairing
 * through `SeverityIcon`, because DESIGN.md §7 holds here too — colour is
 * never the only signal, on a mockup as much as on the board.
 */
function PreviewTile({
  label,
  value,
  severity,
}: {
  label: string;
  value: number;
  severity: DeadlineSeverity;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-xs border border-line bg-panel-2 px-2.5 py-2">
      <span className="flex items-center gap-1.5 text-xl font-medium tabular-nums">
        <SeverityIcon severity={severity} />
        <span className={SEVERITY_TEXT[severity]}>{value}</span>
      </span>
      <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">{label}</span>
    </span>
  );
}
