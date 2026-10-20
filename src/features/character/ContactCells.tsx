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

/**
 * One contact flag as an icon. `role="img"` plus a tooltip rather than a
 * focusable trigger, the same trade `NotificationsPanel`'s badges make: the
 * meaning must reach a screen reader, but a tab stop on every row of a long
 * contact list is worse to keyboard through than the flag is worth.
 */
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

/**
 * A contact's face: a pilot's portrait, a corp's or alliance's logo. A faction
 * has no image on CCP's image server, so it gets a glyph in the same box. Its
 * own column, pinned to the phone card's left edge (`stackEdge`) so it sits
 * beside both lines; decorative, since the name beside it says who it is.
 */
export function ContactPortrait({ contact }: { contact: ContactIdentity }) {
  // `max-w-none`: the cell is `w-0` (a tight desktop column, and pinned out of
  // flow on the phone card), and the base `img { max-width: 100% }` would
  // otherwise collapse the portrait to nothing.
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

/**
 * The name, with an "NPC" tag for an agent or NPC corp — the written word, in
 * the micro-heading treatment rather than a box (DESIGN.md §6), carries it.
 * `flags`, when given, ride beside the name on the phone card only: there the
 * Flags column is hidden, and a blocked or watched mark belongs with the name
 * it is about rather than at the end of the meta line.
 */
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
        <span className="shrink-0 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('contacts.npcBadge')}
        </span>
      )}
      {flags && <span className="inline-flex shrink-0 sm:hidden">{flags}</span>}
    </span>
  );
}

/** A contact's blocked/watched marks, or null for neither. */
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

/**
 * A value the phone's dense card can do without (`data-dense-omit`,
 * index.css): an empty cell's dash, which reads as "none" in a table column
 * but would print as one more "· —" on the meta line, or a word the card
 * already says another way. The card hides a cell holding nothing else.
 */
export function DenseOmit({ children }: { children: ReactNode }) {
  return <span data-dense-omit>{children}</span>;
}

export function EmptyCell() {
  return <DenseOmit>—</DenseOmit>;
}

/**
 * One line of the Corp / Alliance cell: the entity's name, a "yours" badge
 * when the contact sits inside the reader's own corp or alliance, and the
 * standing tag of a *separate* entry of theirs that also covers this pilot.
 *
 * The tag is placed against the entity it comes from rather than in the
 * Standing column, because the whole of its meaning is which entity supplied
 * it — in the Standing column it would read as a second opinion about the
 * pilot, which is exactly what it is not.
 */
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
