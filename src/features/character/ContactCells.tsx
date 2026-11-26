import { type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StandingIcon, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { ICON_SIZE } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { contactKind, type ContactIdentity } from '@/features/character/contactsFilter';
import { allianceLogoUrl, characterPortraitUrl, corporationLogoUrl } from '@/lib/eveImages';
import type { CharacterContact } from '@/esi/endpoints';
import { type EffectiveStanding } from '@/features/character/contactStandings';

export function FlagBadge({
  icon,
  label,
  tone,
}: {
  icon: ReactElement;
  label: string;
  tone: string;
}) {
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className={`shrink-0 ${tone}`}>
        {icon}
      </span>
    </Tooltip>
  );
}

export function ContactPortrait({ contact }: { contact: ContactIdentity }) {
  const box = 'block size-6 max-w-none shrink-0 rounded-xs border border-line';
  if (contact.contact_type === 'faction') {
    return (
      <span aria-hidden className={cx(box, 'flex items-center justify-center text-text-dim')}>
        <Icon.Faction size={ICON_SIZE.sm} />
      </span>
    );
  }
  const src =
    contact.contact_type === 'character'
      ? characterPortraitUrl(contact.contact_id, 64)
      : contact.contact_type === 'corporation'
        ? corporationLogoUrl(contact.contact_id, 64)
        : allianceLogoUrl(contact.contact_id, 64);
  return (
    <img
      src={src}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      crossOrigin="anonymous"
      className={cx(box, 'bg-panel-2')}
    />
  );
}

export function ContactNameCell({
  contact,
  name,
  flags,
}: {
  contact: ContactIdentity;
  name: string;
  flags?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      <span className="truncate">{name}</span>
      {contactKind(contact) === 'npc' && (
        <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('contacts.npcBadge')}
        </span>
      )}
      {flags && <span className="inline-flex shrink-0 sm:hidden">{flags}</span>}
    </span>
  );
}

export function ContactFlags({ contact }: { contact: CharacterContact }) {
  const { t } = useTranslation();
  const blocked = contact.is_blocked === true;
  const watched = contact.is_watched === true;
  if (!blocked && !watched) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {blocked && (
        <FlagBadge
          icon={<Icon.Blocked size={ICON_SIZE.sm} />}
          label={t('contacts.blocked')}
          tone="text-danger"
        />
      )}
      {watched && (
        <FlagBadge
          icon={<Icon.Watched size={ICON_SIZE.sm} />}
          label={t('contacts.watched')}
          tone="text-warning"
        />
      )}
    </span>
  );
}

export function DenseOmit({ children }: { children: ReactNode }) {
  return <span data-dense-omit>{children}</span>;
}

export function EmptyCell() {
  return <DenseOmit>—</DenseOmit>;
}

export function AffiliationLine({
  name,
  own,
  ownLabel,
  alsoVia,
  dim = false,
}: {
  name: string;
  own: boolean;
  ownLabel: string;
  alsoVia: EffectiveStanding | null;
  dim?: boolean;
}) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', dim && 'text-text-dim')}>
      {alsoVia && <StandingIcon value={alsoVia.standing} />}
      <span className="truncate">{name}</span>
      {own && (
        <Tooltip content={ownLabel} openOnTap>
          <span role="img" aria-label={ownLabel} className="shrink-0 text-accent">
            <Icon.Corporation size={ICON_SIZE.sm} />
          </span>
        </Tooltip>
      )}
    </span>
  );
}
