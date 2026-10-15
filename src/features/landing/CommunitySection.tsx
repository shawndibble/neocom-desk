import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { Discord, ICON_SIZE } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { DISCORD_URL } from '@/lib/links';
import { LANDING_QUOTES, type Quote } from './landingQuotes';

/** Pull-quotes in a hairline-divided row; renders nothing when there are none. */
export function QuotesRow({ quotes }: { quotes: readonly Quote[] }) {
  if (quotes.length === 0) return null;
  return (
    <ul className="mt-6 grid divide-y divide-line border border-line bg-bg/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      {quotes.map(({ text, attribution }) => (
        <li key={`${attribution}-${text}`}>
          <figure className="px-5 py-4">
            <blockquote className="text-sm">{text}</blockquote>
            <figcaption className="mt-2 text-xs text-text-dim">{attribution}</figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}

/** The body of the landing page's community section: what the Discord is for, one join link, and quotes when there are any. */
export function CommunitySection({ quotes = LANDING_QUOTES }: { quotes?: readonly Quote[] }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-6 flex flex-col items-start gap-4 border border-line bg-bg/90 px-5 py-6 sm:flex-row sm:items-center sm:gap-5">
        <Discord size={ICON_SIZE.lg} aria-hidden="true" className="shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-sm text-text-dim">{t('login.community.body')}</p>
        <ExternalLink
          href={DISCORD_URL}
          variant="bare"
          className={cx('shrink-0 sm:ml-auto', buttonClassName({ variant: 'accent' }))}
        >
          {t('login.community.join')}
        </ExternalLink>
      </div>
      <QuotesRow quotes={quotes} />
    </>
  );
}
