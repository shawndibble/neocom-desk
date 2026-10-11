import { ExternalLink } from '@/components/ui/ExternalLink';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BootScreen } from '@/app/BootScreen';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { db } from '@/db';
import {
  EveSsoButton,
  DataAgeBadge,
  LogoMark,
  Modal,
  Panel,
  plainTextActionClassName,
  SEVERITY_TEXT,
} from '@/components/ui';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';
import { characterAvatarBoxClassName } from '@/components/ui/characterAvatarBox';
import {
  focusRingClassName,
  inlineLinkClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  Clones,
  Container,
  Contracts,
  Corporation,
  ICON_SIZE,
  Industry,
  MailInbox,
  Market,
  MoonMining,
  NavTravel,
  NavAlerts,
  Notifications,
  Offline,
  OpenSource,
  Orders,
  Planetary,
  ReadOnly,
  Search,
  ScheduledPush,
  Ships,
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
import { formatCountdown } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { DISCORD_URL, REPO_URL } from '@/lib/links';
import { isPlayStoreApp } from '@/lib/playStoreApp';

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
 * The feature catalog under the question tiles, shown as name chips, grouped the way the app's own nav
 * groups its routes (`Layout.tsx`: Progression / Economy / Social) so the page
 * and the signed-in shell describe the same product in the same order. The
 * nav's ungrouped head — Alerts and Corporation beside Overview — has no label
 * there; here it is "Command", with Notifications riding along as Alerts'
 * delivery path. Clones sits under Progression rather than the character
 * sub-nav it lives in, because it is pitched as what training runs on.
 */
const FEATURE_GROUPS: { group: string; items: LandingRow[] }[] = [
  {
    group: 'command',
    items: [
      { icon: Corporation, key: 'corp' },
      // Alerts is the record of what fired; Notifications is how it gets to
      // you. Two rows because the app splits them too — Alerts is a nav route,
      // Notifications is a Settings panel plus the push path — and the bell
      // belongs to the feed you read rather than to the delivery mechanism.
      { icon: Notifications, key: 'alerts' },
      { icon: ScheduledPush, key: 'notifications' },
    ],
  },
  {
    group: 'progression',
    items: [
      { icon: Skills, key: 'skills' },
      { icon: Clones, key: 'clones' },
      { icon: Industry, key: 'industry' },
      { icon: Ships, key: 'ships' },
      { icon: MoonMining, key: 'miningTax' },
      { icon: Planetary, key: 'planetary' },
      { icon: NavTravel, key: 'travel' },
    ],
  },
  {
    group: 'economy',
    items: [
      { icon: Market, key: 'market' },
      { icon: Orders, key: 'orders' },
      { icon: Wallet, key: 'walletOrders' },
      { icon: Container, key: 'assets' },
      { icon: Contracts, key: 'contracts' },
    ],
  },
  {
    group: 'social',
    items: [
      { icon: MailInbox, key: 'social' },
      { icon: Social, key: 'contacts' },
    ],
  },
];

/**
 * One captured screen behind a question tile: the file under
 * `public/screenshots/` and the `login.screenshots.*` key its alt text and
 * enlarged-view caption live under. Real captures filled with sample data, not
 * mockups — the hero preview already covers "what it would look like"; these
 * answer "what does it actually look like". WebP sits outside the PWA precache
 * glob, so a signed-in user never downloads them.
 */
interface Screenshot {
  file: string;
  key: string;
  size: { width: number; height: number };
}

/** Every capture of one form factor was encoded at the same size. */
const DESKTOP_SIZE = { width: 1600, height: 900 };
const PHONE_SIZE = { width: 540, height: 1104 };

function screenshotSrc(shot: Screenshot): string {
  return `/screenshots/${shot.file}.webp`;
}

/**
 * One tile of the questions grid: the question, the capture that answers it,
 * and the `login.answers.*` key its words live under. `span` is a literal
 * Tailwind class (never built from a number, which the compiler would not see)
 * and the six-column grid is arranged so every row sums to six.
 */
interface Tile {
  key: string;
  shot: Screenshot;
  span: string;
}

/**
 * The questions the page leads with. Each names a surface a signed-in pilot
 * actually opens, so the claim under it can be checked against the app rather
 * than admired — no benefit here is broader than what ships. The first is the
 * multi-character one on purpose: it is the claim the tagline makes, and a
 * question is where a reader checks a claim.
 */
const TILES: Tile[] = [
  {
    key: 'attention',
    shot: { file: 'desktop-overview', key: 'overview', size: DESKTOP_SIZE },
    span: 'lg:col-span-4',
  },
  {
    key: 'orders',
    shot: { file: 'desktop-order-detail', key: 'orderDetail', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'build',
    shot: { file: 'desktop-build-plan', key: 'buildPlan', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'journal',
    shot: { file: 'desktop-wallet-journal', key: 'walletJournal', size: DESKTOP_SIZE },
    span: 'lg:col-span-4',
  },
  {
    key: 'marketJumps',
    shot: { file: 'phone-market-jumps', key: 'phoneMarketJumps', size: PHONE_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'routeSafety',
    shot: { file: 'phone-route-safety', key: 'phoneRouteSafety', size: PHONE_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'pilot',
    shot: { file: 'phone-pilot-lookup', key: 'phonePilotLookup', size: PHONE_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'flyNext',
    shot: { file: 'desktop-ship-tree', key: 'shipTree', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'fitting',
    shot: { file: 'desktop-fitting', key: 'fitting', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'survey',
    shot: { file: 'desktop-survey', key: 'survey', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
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
 * The figures are the first tile's Overview capture (`desktop-overview`), so
 * the hero and the tiles tell one story: an industry job finishing in
 * 1h 59m as the next deadline, three jobs running, the 84.2M SP total.
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
  /** The soonest clock on the board: the next industry job to finish, as in the capture. */
  deadlineSeconds: 3600 + 59 * 60,
  trainingSeconds: 86_400 + 4 * 3600 + 20 * 60,
  queued: 6,
  alerts: 13,
  jobsRunning: 3,
};

/** Landing page for signed-out users: what Neocom Desk does, and the EVE SSO login button. */
export function Login() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  // Read once: a TWA launch referrer only exists on the first load.
  const [inApp] = useState(isPlayStoreApp);

  // Wall-clock reads for illustrative "how fresh is this" values in the
  // static preview panel — same class of impurity Overview.tsx and
  // NotificationFeedPanel.tsx already accept for the real thing. Lazy
  // initializers run once on mount rather than every render.
  const [previewFetchedAt] = useState(() => new Date(Date.now() - 2 * MINUTE_MS));

  // The tile capture shown enlarged, or null. One modal for the page
  // rather than one per tile: only one can be open at a time anyway.
  const [zoomed, setZoomed] = useState<Screenshot | null>(null);

  // One Customize permissions dialog for the whole page, opened from either
  // "Log in" button's own link right under it.
  const [customizing, setCustomizing] = useState(false);

  // Bookmark/back-button case: a Character already exists, so the marketing
  // page is not the right thing to show — mirror App.tsx's root gate.
  const characterCount = useLiveQuery(() => db.characters.count());

  function onLogin() {
    setPending(true);
    // The add-a-character branch: nobody is signed in yet, so there is no
    // grant to union with and the base set is the whole request (#295).
    void beginAddCharacterLogin().catch(() => setPending(false));
  }

  if (characterCount === undefined) return <BootScreen gate="login" />;
  if (characterCount > 0) return <Navigate to="/characters" replace />;

  if (inApp) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 py-10 text-center text-text">
        <LogoMark className="size-20" />
        <h1 className="text-2xl font-bold tracking-wide">{t('app.name')}</h1>
        <EveSsoButton size="large" pending={pending} onClick={onLogin} label={t('login.button')} />
        <CustomizeLink onClick={() => setCustomizing(true)} />
        <CustomizePermissionsDialog open={customizing} onClose={() => setCustomizing(false)} />
      </main>
    );
  }

  return (
    <div className="bg-bg text-text">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-4">
          <LogoMark className="size-7" />
          <span className="text-sm font-bold tracking-wide">{t('app.name')}</span>
        </div>
      </header>

      <main>
        {/*
          A funnel, not two columns: the heading is the widest line, the tagline
          narrower, the login button narrower still, so the eye lands on the
          button. The live preview sits under it as the proof, rather than
          beside it competing for the first look.
        */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 py-16 text-center">
          <div className="flex flex-col items-center">
            <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-accent uppercase">
              {t('login.eyebrow')}
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
              {t('login.heading')}
            </h1>
            <p className="mt-4 max-w-xl text-text-dim text-balance">{t('app.tagline')}</p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <EveSsoButton
                size="large"
                pending={pending}
                onClick={onLogin}
                label={t('login.button')}
              />
              <CustomizeLink onClick={() => setCustomizing(true)} />
            </div>
          </div>

          <div
            role="group"
            aria-labelledby="login-preview-label"
            className="relative w-full max-w-3xl rounded-xs border border-line bg-panel/85 p-4 text-left shadow-[0_0_60px_-20px_rgba(87,199,244,0.25)] backdrop-blur-sm"
          >
            <span
              id="login-preview-label"
              className="absolute -top-3 right-4 bg-bg px-1.5 text-[0.625rem] tracking-widest text-text-dim uppercase"
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
            The Overview at the width this column has: a header row (the Next
            deadline button and the alerts bell, as in the real page header),
            then a grid of Widgets. Since the widget-grid redesign (scope
            decision `20261011-064822-overview-is-a-widget-grid-the-pilot-builds`)
            the page is no longer a fixed board with a summary strip, an Orders
            card and an Alerts column: alerts live behind the bell, and every
            tile is a Widget the pilot chose, drawn here as the Number view.

            Every label is read from the keys the real Widgets render
            (`overview.widgets.*`, `overview.board.*`, `overview.header.*`), so a
            retired key shows up as a failing test instead of the literal key
            printed at a signed-out visitor — it has happened once already.
          */}
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-xs border border-line bg-panel-2/50 px-2.5 text-xs">
                <span className="shrink-0 tracking-widest text-text-dim uppercase">
                  {t('overview.header.next')}
                </span>
                <span
                  className={`shrink-0 font-medium whitespace-nowrap tabular-nums ${SEVERITY_TEXT.warning}`}
                >
                  {formatCountdown(PREVIEW.deadlineSeconds)}
                </span>
                <span className="truncate text-text-dim">{t('overview.board.nextJob')}</span>
              </span>
              <span className="flex-1" />
              <DataAgeBadge date={previewFetchedAt} />
              <span
                role="img"
                aria-label={t('nav.alertsWithCount', { count: PREVIEW.alerts })}
                className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-xs border border-line text-text-dim"
              >
                <NavAlerts aria-hidden="true" />
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 min-w-4 rounded-xs bg-accent px-1 text-center text-[0.625rem] leading-4 font-semibold text-bg tabular-nums"
                >
                  {PREVIEW.alerts}
                </span>
              </span>
            </div>

            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-2">
              <PreviewWidget title={t('overview.widgets.wallet.title')}>
                <p className="text-xl font-medium tabular-nums text-isk-pos">
                  {formatIsk(PREVIEW.wallet, 2)}{' '}
                  <small className="text-xs font-normal text-text-dim">{t('overview.isk')}</small>
                </p>
              </PreviewWidget>

              <PreviewWidget title={t('overview.widgets.training.title')}>
                <p className="text-xl leading-tight font-medium">{PREVIEW.trainingSkill}</p>
                <p className="truncate text-xs text-text-dim">
                  {t('overview.timeLeft', { duration: formatCountdown(PREVIEW.trainingSeconds) })}
                  {' · '}
                  {t('overview.board.queued', { count: PREVIEW.queued })}
                </p>
              </PreviewWidget>

              <PreviewWidget title={t('overview.widgets.sp.title')}>
                <p className="text-xl font-medium tabular-nums">
                  {PREVIEW.totalSp}{' '}
                  <small className="text-xs font-normal text-text-dim">
                    {t('overview.widgets.sp.unit')}
                  </small>
                </p>
                <p className="truncate text-xs text-text-dim">
                  {t('overview.widgets.sp.unallocated', { sp: PREVIEW.unallocatedSp })}
                </p>
              </PreviewWidget>

              <PreviewWidget title={t('overview.widgets.industry.title')}>
                <p className="text-xl font-medium tabular-nums">{PREVIEW.jobsRunning}</p>
                <p className="truncate text-xs text-text-dim">
                  {t('overview.widgets.industry.running')}
                  {' · '}
                  {formatCountdown(PREVIEW.deadlineSeconds)}
                </p>
              </PreviewWidget>
            </div>
          </div>
        </section>

        <LandingSection id="login-answers" heading={t('login.answersHeading')}>
          <p className="mt-2 max-w-2xl text-sm text-text-dim">{t('login.answersLead')}</p>
          {/*
          One grid, not a questions list over a separate gallery: each tile is a
          question, the screen that answers it, and one line of why. Selecting
          the picture enlarges it. The picture is a crop (top-aligned, fixed
          height), so the enlarged view is where the table text becomes
          readable.
        */}
          <ul className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            {TILES.map((tile) => (
              <li key={tile.key} className={cx('flex', tile.span)}>
                <QuestionTile tile={tile} onOpen={() => setZoomed(tile.shot)} />
              </li>
            ))}
          </ul>
          <Modal
            open={zoomed !== null}
            onClose={() => setZoomed(null)}
            title={zoomed ? t(`login.screenshots.${zoomed.key}.caption`) : ''}
            placement="media"
          >
            {zoomed && (
              <img
                src={screenshotSrc(zoomed)}
                alt={t(`login.screenshots.${zoomed.key}.alt`)}
                width={zoomed.size.width}
                height={zoomed.size.height}
                className="mx-auto block h-auto max-h-[80vh] w-auto max-w-full"
              />
            )}
          </Modal>
        </LandingSection>
        <LandingSection id="login-features" heading={t('login.featuresHeading')}>
          {FEATURE_GROUPS.map(({ group, items }) => (
            <div key={group} className="mt-6">
              <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t(`login.featureGroups.${group}`)}
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {items.map(({ icon: Icon, key }) => (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-xs border border-line bg-panel px-3 py-1.5 text-sm"
                  >
                    <Icon size={ICON_SIZE.md} aria-hidden="true" className="shrink-0 text-accent" />
                    {t(`login.features.${key}.name`)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </LandingSection>
        <LandingSection id="login-trust" heading={t('login.trustHeading')}>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, key }) => (
              <Panel key={key}>
                <Icon size={ICON_SIZE.lg} aria-hidden="true" className="text-accent" />
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
          <p className="mt-6 max-w-3xl text-sm text-text-dim">{t('login.permissionsHint')}</p>
          <p className="mt-2 max-w-3xl text-sm text-text-dim">
            {t('login.permissionsPrivacy')}{' '}
            <a href="/privacy.html" className={inlineLinkClassName}>
              {t('login.footerPrivacy')}
            </a>
          </p>
        </LandingSection>

        <section className="border-t border-line px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold">{t('login.bottomCtaHeading')}</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-text-dim">{t('login.bottomCtaBody')}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <EveSsoButton
              size="large"
              pending={pending}
              onClick={onLogin}
              label={t('login.button')}
            />
            <CustomizeLink onClick={() => setCustomizing(true)} />
          </div>
        </section>

        <CustomizePermissionsDialog open={customizing} onClose={() => setCustomizing(false)} />
      </main>

      <footer className="flex flex-wrap justify-center gap-6 px-6 py-6 text-xs text-text-dim">
        <ExternalLink href={REPO_URL} variant="quiet">
          {t('login.footerOpenSource')}
        </ExternalLink>
        <a href="/privacy.html" className={FOOTER_LINK}>
          {t('login.footerPrivacy')}
        </a>
        <a href="/data-credit.html" className={FOOTER_LINK}>
          {t('login.footerDataCredit')}
        </a>
        <ExternalLink href={DISCORD_URL} variant="quiet">
          {t('login.footerDiscord')}
        </ExternalLink>
      </footer>
    </div>
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

/**
 * One question tile: a capture that opens enlarged, then the question and one
 * line of answer. The button's label carries the image's alt plus what
 * selecting does — a button's children are presentational, so the alt alone
 * would never be read. Explicit `width`/`height` reserve the image's box before
 * the lazy image arrives, so the grid does not jump as a visitor scrolls into
 * it; the fixed height and `object-top` crop every capture to the same strip
 * whatever its shape (a phone capture is far taller than a desktop one).
 */
function QuestionTile({ tile, onOpen }: { tile: Tile; onOpen: () => void }) {
  const { t } = useTranslation();
  const { shot } = tile;
  const alt = t(`login.screenshots.${shot.key}.alt`);
  return (
    <Panel padded={false} className="h-full w-full">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('login.screenshotEnlarge', { alt })}
        className={cx(
          'relative block h-48 w-full cursor-zoom-in overflow-hidden sm:h-56',
          // Inset: the button clips its own overflow, so an outset ring would be cut off.
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
        )}
      >
        <img
          src={screenshotSrc(shot)}
          alt={alt}
          width={shot.size.width}
          height={shot.size.height}
          loading="lazy"
          decoding="async"
          className={cx('h-full w-full object-cover object-top', interactiveClassName)}
        />
        {/* DESIGN.md §6c "Magnifier badge": the at-rest cue that the picture opens, since a phone has no cursor. */}
        <span
          aria-hidden="true"
          className="absolute right-2 bottom-2 rounded-xs border border-line bg-bg/80 p-1 text-text"
        >
          <Search size={ICON_SIZE.sm} aria-hidden="true" />
        </span>
      </button>
      <div className="border-t border-line p-4">
        <h3 className="text-base font-semibold text-balance">
          {t(`login.answers.${tile.key}.question`)}
        </h3>
        <p className="mt-2 text-sm text-text-dim">{t(`login.answers.${tile.key}.answer`)}</p>
      </div>
    </Panel>
  );
}

/** A same-origin footer link: `ExternalLink`'s quiet look without the new-tab icon (our own pages open in the same tab). */
const FOOTER_LINK = cx(
  'rounded-xs underline-offset-2 hover:text-text hover:underline',
  interactiveClassName,
  focusRingClassName
);

/** Opens the Customize permissions dialog — always right under a "Log in" button, never a substitute for one. */
function CustomizeLink({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={plainTextActionClassName()} onClick={onClick}>
      {t('permissions.customize.linkLabel')}
    </button>
  );
}

/**
 * One Widget in the hero preview: the real Widget's frame (micro title in a
 * header row over a Number body) without its page link or menu.
 *
 * Not the live `Widget` component: that one links its title to the page that
 * owns it, and every destination is a route a signed-out visitor cannot
 * reach. A mockup that offers live navigation into gated pages is a promise
 * the page cannot keep.
 */
function PreviewWidget({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-xs border border-line bg-panel"
    >
      <p className="truncate border-b border-line px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-widest uppercase">
        {title}
      </p>
      <div className="grid gap-0.5 px-3 py-2.5">{children}</div>
    </section>
  );
}
