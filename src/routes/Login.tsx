import { ExternalLink } from '@/components/ui/ExternalLink';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { BootScreen } from '@/app/BootScreen';
import { releaseLandingShell } from '@/app/landingShell';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { EveSsoButton, LogoMark, plainTextActionClassName } from '@/components/ui';
import { CommunitySection } from '@/features/landing/CommunitySection';
import { FeatureShowcase } from '@/features/landing/FeatureShowcase';
import { LandingFaq } from '@/features/landing/LandingFaq';
import { LandingBackdrop, LandingSection } from '@/features/landing/LandingSection';
import { TrustSection } from '@/features/landing/TrustSection';
import { useBelowFold } from '@/features/landing/useBelowFold';
import { LandingHeader } from '@/features/landing/LandingHeader';
import { OverviewDemo } from '@/features/landing/OverviewDemo';
import { Reveal } from '@/features/landing/Reveal';
import { QuestionGrid } from '@/features/landing/QuestionGrid';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { DISCORD_URL, REPO_URL } from '@/lib/links';
import { isPlayStoreApp } from '@/lib/playStoreApp';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';

/** Landing page for signed-out users: what Neocom Desk does, and the EVE SSO login button. */
export function Login() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  // Read once: a TWA launch referrer only exists on the first load.
  const [inApp] = useState(isPlayStoreApp);

  // One Customize permissions dialog for the whole page, opened from either
  // "Log in" button's own link right under it.
  const [customizing, setCustomizing] = useState(false);

  // The large login buttons (hero and closing call to action); the sticky
  // header shows its own only while neither is in view.
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const ctaRefs = useMemo(() => [heroCtaRef], []);

  // Bookmark/back-button case: a Character already exists, so the marketing
  // page is not the right thing to show — mirror App.tsx's root gate.
  const characterCount = useCharacterCountOrLoading();

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
    <div className="landing-root bg-bg text-text">
      <LandingHeader ctaRefs={ctaRefs} pending={pending} onLogin={onLogin} />

      <main>
        {/*
          A funnel, not two columns: the heading is the widest line, the tagline
          narrower, the login button narrower still, so the eye lands on the
          button. The live preview sits under it as the proof, rather than
          beside it competing for the first look.
        */}
        <section className="relative isolate overflow-hidden">
          <LandingBackdrop tone="space" ship={{ ship: 'megathron', side: 'right' }} eager />
          <div className="relative mx-auto flex max-w-[96rem] flex-col items-center gap-12 px-4 py-16 text-center sm:px-6">
            <div className="flex flex-col items-center">
              <p className="lp-hero-in lp-hero-in-0 text-[0.6875rem] font-bold tracking-[0.14em] text-accent uppercase">
                {t('login.eyebrow')}
              </p>
              <h1 className="lp-hero-in lp-hero-in-1 mt-3 max-w-3xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
                {t('login.heading')}
              </h1>
              <p className="lp-hero-in lp-hero-in-2 mt-4 max-w-xl text-text-dim text-balance">
                {t('app.tagline')}
              </p>
              <div
                ref={heroCtaRef}
                className="lp-hero-in lp-hero-in-3 lp-cta-glow mt-7 flex flex-col items-center gap-3"
              >
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
          </div>
        </section>

        {belowFold && (
          <>
            <LandingSection
              id="login-answers"
              heading={t('login.answersHeading')}
              ship={{ ship: 'venture', side: 'right' }}
            >
              <p className="mt-2 max-w-2xl text-sm text-text-dim">{t('login.answersLead')}</p>
              <QuestionGrid />
            </LandingSection>
            <LandingSection
              id="login-features"
              heading={t('login.featuresHeading')}
              ship={{ ship: 'hulk', side: 'left' }}
            >
              <FeatureShowcase />
            </LandingSection>
            <LandingSection id="login-trust" heading={t('login.trustHeading')} tone="panel">
              <TrustSection />
            </LandingSection>
            <LandingSection id="login-community" heading={t('login.communityHeading')} tone="space">
              <CommunitySection />
            </LandingSection>
            <LandingSection id="login-faq" heading={t('login.faqHeading')} tone="panel">
              <LandingFaq />
            </LandingSection>

            <section className="relative isolate overflow-hidden">
              <LandingBackdrop tone="space" ship={{ ship: 'orca', side: 'left' }} />
              <Reveal className="relative mx-auto max-w-6xl px-6 py-20 text-center">
                <h2 className="text-2xl font-semibold">{t('login.bottomCtaHeading')}</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm text-text-dim">
                  {t('login.bottomCtaBody')}
                </p>
                <div className="mt-6 flex flex-col items-center gap-3">
                  <EveSsoButton
                    size="large"
                    pending={pending}
                    onClick={onLogin}
                    label={t('login.button')}
                  />
                  <CustomizeLink onClick={() => setCustomizing(true)} />
                </div>
              </Reveal>
            </section>
          </>
        )}

        <CustomizePermissionsDialog open={customizing} onClose={() => setCustomizing(false)} />
      </main>

      {belowFold && (
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

/** Opens the Customize permissions dialog — always right under a "Log in" button, never a substitute for one. */
function CustomizeLink({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={plainTextActionClassName()} onClick={onClick}>
      {t('permissions.customize.linkLabel')}
    </button>
  );
}
