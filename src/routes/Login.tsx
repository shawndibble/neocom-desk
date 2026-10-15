import { ExternalLink } from '@/components/ui/ExternalLink';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BootScreen } from '@/app/BootScreen';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { db } from '@/db';
import { EveSsoButton, LogoMark, Panel, plainTextActionClassName } from '@/components/ui';
import { OverviewDemo } from '@/features/landing/OverviewDemo';
import { QuestionGrid } from '@/features/landing/QuestionGrid';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';
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
  Notifications,
  Offline,
  OpenSource,
  Orders,
  Planetary,
  ReadOnly,
  ScheduledPush,
  Ships,
  Skills,
  Social,
  TokenPrivacy,
  Wallet,
  type IconProps,
} from '@/components/ui/icons';
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

/** Landing page for signed-out users: what Neocom Desk does, and the EVE SSO login button. */
export function Login() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  // Read once: a TWA launch referrer only exists on the first load.
  const [inApp] = useState(isPlayStoreApp);

  // The tile capture shown enlarged, or null. One modal for the page
  // rather than one per tile: only one can be open at a time anyway.

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
        <section className="mx-auto flex max-w-[96rem] flex-col items-center gap-12 px-4 py-16 text-center sm:px-6">
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

          <OverviewDemo />
        </section>

        <LandingSection id="login-answers" heading={t('login.answersHeading')}>
          <p className="mt-2 max-w-2xl text-sm text-text-dim">{t('login.answersLead')}</p>
          <QuestionGrid />
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
