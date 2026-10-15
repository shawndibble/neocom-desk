import { useTranslation } from 'react-i18next';
import { plainTextActionClassName } from '@/components/ui';
import { cx } from '@/lib/cx';
import { DESKTOP_SIZE } from './screenshots';

/**
 * The three steps from signed out to an answer: the `login.how.steps.<key>`
 * copy and the real capture each shows. The first two captures are not the
 * desktop size: the sign-in area and the permissions dialog.
 */
interface Step {
  key: string;
  file: string;
  size: { width: number; height: number };
}

const STEPS: Step[] = [
  { key: 'login', file: 'step-login', size: { width: 700, height: 300 } },
  { key: 'share', file: 'step-permissions', size: { width: 1025, height: 766 } },
  { key: 'answers', file: 'desktop-overview-alerts', size: DESKTOP_SIZE },
];

/**
 * How it works: a hairline-divided row of three numbered steps (1px `bg-line`
 * gaps between opaque cells, as the question grid does), not three cards. Step
 * two offers the Customize permissions dialog through `onCustomize`.
 */
export function HowItWorks({ onCustomize }: { onCustomize: () => void }) {
  const { t } = useTranslation();
  return (
    <ol className="mt-6 grid grid-cols-1 gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
      {STEPS.map((step, index) => (
        <li key={step.key} className="flex flex-col bg-bg">
          {/* Fixed shape with the capture pinned to its top: the three differ in size. */}
          <div className="aspect-video overflow-hidden border-b border-line">
            <img
              src={`/screenshots/${step.file}.webp`}
              alt={t(`login.how.steps.${step.key}.alt`)}
              width={step.size.width}
              height={step.size.height}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </div>
          <div className="flex flex-1 flex-col p-4">
            <p className="font-mono text-[0.6875rem] tracking-widest text-text-dim">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h3 className="mt-1.5 text-base font-semibold text-balance">
              {t(`login.how.steps.${step.key}.title`)}
            </h3>
            <p className="mt-2 text-sm text-text-dim">{t(`login.how.steps.${step.key}.body`)}</p>
            {step.key === 'share' && (
              <button
                type="button"
                onClick={onCustomize}
                className={cx(plainTextActionClassName(), 'mt-3 self-start')}
              >
                {t('permissions.customize.linkLabel')}
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
