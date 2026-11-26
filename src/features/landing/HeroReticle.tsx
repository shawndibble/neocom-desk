import { useTranslation } from 'react-i18next';
import { hudLabelClassName } from './hudLabel';
import { cx } from '@/lib/cx';

const BRACKET = 'absolute size-6 border-warning sm:size-10';

export function HeroReticle({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden="true"
      className={cx(
        'relative mx-auto flex aspect-square w-44 items-center justify-center sm:w-80 lg:w-full lg:max-w-[36rem]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-full border border-accent/20" />
      <div className="pointer-events-none absolute inset-[7%] rounded-full border border-dashed border-accent/35" />
      <div className="pointer-events-none absolute inset-[14%] rounded-full border-2 border-accent/60 shadow-[0_0_60px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]" />
      <img
        src="/landing/megathron.webp"
        alt=""
        width={512}
        height={512}
        loading="eager"
        fetchPriority="high"
        className="relative w-[68%] rounded-full"
      />
      <span className={cx(BRACKET, 'top-[12%] left-[12%] border-t-2 border-l-2')} />
      <span className={cx(BRACKET, 'top-[12%] right-[12%] border-t-2 border-r-2')} />
      <span className={cx(BRACKET, 'bottom-[12%] left-[12%] border-b-2 border-l-2')} />
      <span className={cx(BRACKET, 'right-[12%] bottom-[12%] border-r-2 border-b-2')} />
      <ReadOut
        className="top-[6%] -left-2 border-success/50"
        titleClassName="text-success"
        title={t('login.reticle.industry.title')}
        lines={[t('login.reticle.industry.line1'), t('login.reticle.industry.line2')]}
      />
      <ReadOut
        className="top-[6%] -right-2 border-accent/40"
        titleClassName="text-accent"
        title={t('login.reticle.market.title')}
        lines={[t('login.reticle.market.line1'), t('login.reticle.market.line2')]}
      />
      <ReadOut
        className="bottom-[8%] -left-2 border-warning/45"
        titleClassName="text-warning"
        title={t('login.reticle.fit.title')}
        lines={[t('login.reticle.fit.line1'), t('login.reticle.fit.line2')]}
      />
      <ReadOut
        className="right-[-0.5rem] bottom-[8%] border-accent/40"
        titleClassName="text-accent"
        title={t('login.reticle.alerts.title')}
        lines={[t('login.reticle.alerts.line1'), t('login.reticle.alerts.line2')]}
      />
      <p
        className={cx(
          hudLabelClassName,
          'absolute top-1/2 -right-2 hidden text-[0.6875rem] text-accent/80 lg:block'
        )}
      >
        {t('login.reticle.locked')}
      </p>
    </div>
  );
}

function ReadOut({
  className,
  titleClassName,
  title,
  lines,
}: {
  className: string;
  titleClassName: string;
  title: string;
  lines: string[];
}) {
  return (
    <div
      className={cx(
        'absolute hidden border bg-bg/85 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-text-dim lg:block',
        className
      )}
    >
      <p className={cx(hudLabelClassName, titleClassName)}>{title}</p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
