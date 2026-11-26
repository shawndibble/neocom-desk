import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Discord, Github, ICON_SIZE } from '@/components/ui/icons';
import { DISCORD_URL, REPO_URL } from '@/lib/links';
import { LANDING_QUOTES, type Quote } from './landingQuotes';

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

function CommunityLink({
  href,
  icon,
  name,
  hint,
}: {
  href: string;
  icon: ReactNode;
  name: string;
  hint: string;
}) {
  return (
    <ExternalLink
      href={href}
      variant="bare"
      className="flex items-center gap-3.5 border border-line bg-bg/90 px-4 py-3.5 hover:border-accent/60"
    >
      <span className="shrink-0 text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{name}</span>
        <span className="block text-xs text-text-dim">{hint}</span>
      </span>
    </ExternalLink>
  );
}

export function CommunitySection({ quotes = LANDING_QUOTES }: { quotes?: readonly Quote[] }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-6 grid gap-3">
        <CommunityLink
          href={DISCORD_URL}
          icon={<Discord size={ICON_SIZE.lg} aria-hidden="true" />}
          name={t('login.community.discord')}
          hint={t('login.community.discordHint')}
        />
        <CommunityLink
          href={REPO_URL}
          icon={<Github size={ICON_SIZE.lg} aria-hidden="true" />}
          name={t('login.community.github')}
          hint={t('login.community.githubHint')}
        />
      </div>
      <QuotesRow quotes={quotes} />
    </>
  );
}
