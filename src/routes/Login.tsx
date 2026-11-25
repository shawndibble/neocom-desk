import { ExternalLink } from '@/components/ui/ExternalLink';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { BootScreen } from '@/app/BootScreen';
import { releaseLandingShell } from '@/app/landingShell';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { EveSsoButton, LogoMark, plainTextActionClassName } from '@/components/ui';
import { ICON_SIZE, PlayVideo } from '@/components/ui/icons';
import { InlineError } from '@/components/ui/InlineError';
import { CommunitySection } from '@/features/landing/CommunitySection';
import { FeatureShowcase } from '@/features/landing/FeatureShowcase';
import { LandingFaq } from '@/features/landing/LandingFaq';
import { LandingBackdrop, LandingSection } from '@/features/landing/LandingSection';
import { TrustSection } from '@/features/landing/TrustSection';
import { useBelowFold } from '@/features/landing/useBelowFold';
import { LandingHeader } from '@/features/landing/LandingHeader';
import { HeroReticle } from '@/features/landing/HeroReticle';
import { LANDING_ANCHORS, landingIndex } from '@/features/landing/landingAnchors';
import { OverviewDemo } from '@/features/landing/OverviewDemo';
import { Reveal } from '@/features/landing/Reveal';
import { QuestionGrid } from '@/features/landing/QuestionGrid';
import { PromoVideo } from '@/features/landing/PromoVideo';
import { PROMO_VIDEO, PROMO_VIDEO_ANCHOR } from '@/features/landing/promoVideoConfig';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { DISCORD_URL, REPO_URL } from '@/lib/links';
import { isPlayStoreApp } from '@/lib/playStoreApp';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import { setLoginReturnTo, usableLoginReturnTo } from '@/auth/loginReturnTo';

/** Landing page for signed-out users: what Neocom Desk does, and the EVE SSO login button. */
export function Login() {
  const { t } = useTranslation();
  /** A band's id, its "01"-style place and its eyebrow, the header link's own label. */
  const sectionLabels = (id: string) => ({
    id,
    index: landingIndex(id),
    eyebrow: t(`login.header.${LANDING_ANCHORS.find((anchor) => anchor.id === id)?.key ?? ''}`),
  });
  const [pending, setPending] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  // Read once: a TWA launch referrer only exists on the first load.
  const [inApp] = useState(isPlayStoreApp);

  // One Customize permissions dialog for the whole page, opened from either
  // "Log in" button's own link right under it.
  const [customizing, setCustomizing] = useState(false);

  // The promo video starts from its poster or from the hero's "Watch" link.
  const [promoPlays, setPromoPlays] = useState(0);
  const playPromo = () => setPromoPlays((n) => n + 1);

  // The large login buttons (hero and closing call to action); the sticky
  // header shows its own only while neither is in view.
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const ctaRefs = useMemo(() => [heroCtaRef], []);

  // Bookmark/back-button case: a Character already exists, so the marketing
  // page is not the right thing to show — mirror App.tsx's root gate.
  const characterCount = useCharacterCountOrLoading();

  // Sent here by the auth gate (`RequireCharacter`): stash the page the
  // visitor asked for so the login lands there, not on the default.
  const from = usableLoginReturnTo((useLocation().state as { from?: unknown } | null)?.from);
  useEffect(() => {
    if (characterCount === 0 && from !== null) setLoginReturnTo(from);
  }, [characterCount, from]);

  // The prerendered hero (`app/landingShell.ts`) stands in through the boot
  // screen. Let it go once this page knows what it renders: a layout effect,
  // so the real hero commits in the frame the shell leaves.
  useLayoutEffect(() => {
    if (characterCount !== undefined) releaseLandingShell();
  }, [characterCount]);

  // After the release above: a hash's scroll needs `#root` shown.
  const belowFold = useBelowFold(characterCount === 0 && !inApp);

  function onLogin() {
    setPending(true);
    setLoginFailed(false);
    // The add-a-character branch: nobody is signed in yet, so there is no
    // grant to union with and the base set is the whole request (#295).
    void beginAddCharacterLogin().catch(() => {
      setPending(false);
      setLoginFailed(true);
    });
  }

  if (characterCount === undefined) return <BootScreen gate="login" />;
  if (characterCount > 0) return <Navigate to="/characters" replace />;

  if (inApp) {
    return (
      <main className="safe-inset flex min-h-dvh [--safe-x:1.5rem] [--safe-y:2.5rem] flex-col items-center justify-center gap-6 bg-bg text-center text-text">
        <LogoMark className="size-20" />
        <h1 className="text-2xl font-bold tracking-wide">{t('app.name')}</h1>
        <EveSsoButton size="large" pending={pending} onClick={onLogin} label={t('login.button')} />
        {loginFailed && <InlineError>{t('login.failed')}</InlineError>}
        <CustomizeLink onClick={() => setCustomizing(true)} />
        <CustomizePermissionsDialog open={customizing} onClose={() => setCustomizing(false)} />
      </main>
    );
  }

  return (
    <div className="landing-root bg-bg text-text">
      <LandingHeader ctaRefs={ctaRefs} pending={pending} onLogin={onLogin} />

      <main>
        {/*
          The hero is a ship locked in a targeting reticle beside the pitch:
          copy and the login button on the left (centred over the reticle on a
          phone), the reticle on the right. Under the button, the three trust
          points a pilot weighs before handing over an EVE login.
        */}
        <section className="relative isolate overflow-hidden">
          <LandingBackdrop tone="space" />
          <div className="relative mx-auto grid max-w-page items-center gap-8 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12 lg:px-16 lg:py-20">
            <HeroReticle className="lp-hero-in lp-hero-in-0 lg:order-2" />
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <p className="lp-hero-in lp-hero-in-0 flex items-center gap-2.5 font-mono text-xs tracking-[0.18em] text-balance text-accent uppercase">
                <span
                  aria-hidden="true"
                  className="hidden size-2 shrink-0 bg-accent shadow-[0_0_12px_var(--color-accent)] sm:block"
                />
                {t('login.eyebrow')}
              </p>
              <h1 className="lp-hero-in lp-hero-in-1 mt-5 max-w-3xl font-hud text-4xl leading-[0.98] font-bold text-balance uppercase sm:text-6xl xl:text-7xl">
                {t('login.heading')} <span className="text-accent">{t('login.headingAccent')}</span>
              </h1>
              <p className="lp-hero-in lp-hero-in-2 mt-6 max-w-xl text-text-dim sm:text-lg">
                {t('login.tagline')}
              </p>
              <div className="lp-hero-in lp-hero-in-3 mt-8 flex flex-col items-center gap-4 lg:items-start">
                <div className="flex flex-col items-center gap-x-6 gap-y-4 sm:flex-row">
                  <div ref={heroCtaRef} className="lp-cta-glow">
                    <EveSsoButton
                      size="large"
                      pending={pending}
                      onClick={onLogin}
                      label={t('login.button')}
                    />
                  </div>
                  <button
                    type="button"
                    className={plainTextActionClassName('gap-2.5')}
                    onClick={playPromo}
                  >
                    <span
                      aria-hidden="true"
                      className="lp-round flex size-9 items-center justify-center border border-accent text-accent"
                    >
                      <PlayVideo size={ICON_SIZE.sm} aria-hidden="true" />
                    </span>
                    {t('login.video.heroLink', { duration: PROMO_VIDEO.duration })}
                  </button>
                </div>
                {loginFailed && <InlineError>{t('login.failed')}</InlineError>}
                <TrustLine className="lg:justify-start" />
                <CustomizeLink onClick={() => setCustomizing(true)} />
              </div>
            </div>
          </div>
        </section>

        <LandingSection
          {...sectionLabels('login-overview')}
          heading={t('login.overviewHeading')}
          lead={t('login.overviewLead')}
        >
          <OverviewDemo />
        </LandingSection>

        {belowFold && (
          <>
            <LandingSection
              {...sectionLabels('login-answers')}
              heading={t('login.answersHeading')}
              lead={t('login.answersLead')}
              ship={{ ship: 'venture', side: 'right' }}
            >
              <QuestionGrid />
            </LandingSection>
            <LandingSection
              {...sectionLabels(PROMO_VIDEO_ANCHOR)}
              heading={t('login.video.heading')}
              lead={t('login.video.lead', { duration: PROMO_VIDEO.duration })}
              tone="space"
            >
              <PromoVideo plays={promoPlays} onPlay={playPromo} />
            </LandingSection>
            <LandingSection
              {...sectionLabels('login-features')}
              heading={t('login.featuresHeading')}
              ship={{ ship: 'hulk', side: 'left' }}
            >
              <FeatureShowcase />
            </LandingSection>
            <LandingSection
              {...sectionLabels('login-trust')}
              heading={t('login.trustHeading')}
              tone="panel"
            >
              <TrustSection />
            </LandingSection>
            <LandingSection
              {...sectionLabels('login-community')}
              heading={t('login.communityHeading')}
              tone="space"
            >
              <CommunitySection />
            </LandingSection>
            <LandingSection
              {...sectionLabels('login-faq')}
              heading={t('login.faqHeading')}
              tone="panel"
            >
              <LandingFaq />
            </LandingSection>

            <section className="relative isolate overflow-hidden">
              <LandingBackdrop tone="space" />
              <Reveal className="relative mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center">
                <img
                  src="/landing/orca.webp"
                  alt=""
                  aria-hidden="true"
                  width={512}
                  height={512}
                  loading="lazy"
                  decoding="async"
                  className="lp-round size-36 border-2 border-accent/55 shadow-[0_0_60px_color-mix(in_srgb,var(--color-accent)_30%,transparent)] sm:size-44"
                />
                <h2 className="mt-8 font-hud text-6xl leading-none font-bold uppercase sm:text-8xl">
                  {t('login.bottomCtaHeading')}
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-text-dim sm:text-lg">
                  {t('login.bottomCtaBody')}
                </p>
                <div className="lp-cta-glow mt-8 flex flex-col items-center gap-4">
                  <EveSsoButton
                    size="large"
                    pending={pending}
                    onClick={onLogin}
                    label={t('login.button')}
                  />
                  <TrustLine />
                  <CustomizeLink onClick={() => setCustomizing(true)} />
                </div>
              </Reveal>
            </section>
          </>
        )}

        <CustomizePermissionsDialog open={customizing} onClose={() => setCustomizing(false)} />
      </main>

      {belowFold && (
        <footer className="flex flex-wrap justify-center gap-6 px-6 py-6 text-xs text-text-dim max-md:pb-24">
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
      )}
    </div>
  );
}

/** A same-origin footer link: `ExternalLink`'s quiet look without the new-tab icon (our own pages open in the same tab). */
const FOOTER_LINK = cx(
  'rounded-xs underline-offset-2 hover:text-text hover:underline',
  interactiveClassName,
  focusRingClassName
);

/** The three trust points under each large login button, as a HUD readout. */
function TrustLine({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <ul
      className={cx(
        'flex flex-wrap justify-center gap-x-5 gap-y-1.5 font-mono text-xs text-text-dim',
        className
      )}
    >
      {(['device', 'writes', 'revoke'] as const).map((key) => (
        <li key={key} className="flex items-center gap-2">
          <span aria-hidden="true" className="text-accent">
            ◆
          </span>
          {t(`login.trustLine.${key}`)}
        </li>
      ))}
    </ul>
  );
}

/** Opens the Customize permissions dialog — always right under a "Log in" button, never a substitute for one. */
function CustomizeLink({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={plainTextActionClassName()} onClick={onClick}>
      {t('permissions.customize.linkLabel')}
    </button>
  );
}
