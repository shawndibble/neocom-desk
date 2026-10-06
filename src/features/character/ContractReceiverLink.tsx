import { useTranslation } from 'react-i18next';
import { AllianceLink, CharacterLink, CorporationLink } from '@/features/entities';
import { StandingTag } from './StandingTag';
import type { EffectiveStanding } from './contactStandings';
import type { ContractReceiver } from './contractCounterparty';

interface Props {
  receiver: ContractReceiver | null;
  name: string;
  standing?: EffectiveStanding | null;
}

/** Receiver's entity link + standing; a dim "offered" tag when it was only assigned, "—" when none. */
export function ContractReceiverLink({ receiver, name, standing = null }: Props) {
  const { t } = useTranslation();
  if (receiver === null) return <span className="text-text-dim">—</span>;
  const Link =
    receiver.kind === 'corporation'
      ? CorporationLink
      : receiver.kind === 'alliance'
        ? AllianceLink
        : CharacterLink;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link id={receiver.id} className="text-left">
        {name}
      </Link>
      <StandingTag standing={standing} />
      {receiver.role === 'assignee' && (
        <span className="text-text-dim" title={t('contracts.offeredToHint')}>
          {t('contracts.offeredTag')}
        </span>
      )}
    </span>
  );
}
