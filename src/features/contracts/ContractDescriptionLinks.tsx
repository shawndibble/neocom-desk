import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { ExternalMark } from '@/components/ui/ExternalLink';
import { contractDescriptionLinks } from './descriptionLinkParts';

function hostOf(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}

export function ContractDescriptionLinks({ description }: { description: string | undefined }) {
  const { t } = useTranslation();
  const links = useMemo(() => contractDescriptionLinks(description), [description]);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((href) => (
        <Button
          key={href}
          size="sm"
          onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
        >
          {t('contractDetail.openLink', { host: hostOf(href) })}
          <ExternalMark />
        </Button>
      ))}
    </div>
  );
}
