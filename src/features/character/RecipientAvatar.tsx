import { useState } from 'react';
import { CharacterAvatar } from '@/components/ui';
import {
  CHARACTER_AVATAR_SIZE,
  characterAvatarBoxClassName,
} from '@/components/ui/characterAvatarBox';
import * as Icon from '@/components/ui/icons';
import { allianceLogoUrl, corporationLogoUrl } from '@/lib/eveImages';
import { cx } from '@/lib/cx';
import {
  recipientKey,
  type ComposeRecipient,
  type ComposeRecipientType,
} from '@/engine/mail/mailCompose';

const AVATAR_SIZE = 'sm';

const FALLBACK: Record<ComposeRecipientType, typeof Icon.MailingList> = {
  character: Icon.MailCharacter,
  corporation: Icon.Corporation,
  alliance: Icon.MailAlliance,
  mailing_list: Icon.MailingList,
};

interface RecipientAvatarProps {
  recipient: Pick<ComposeRecipient, 'recipient_id' | 'recipient_type'>;
}

/**
 * A mail recipient's portrait or logo, for the composer's chips and options.
 * Decorative: the name and type label beside it already say who it is. A
 * mailing list has no image, and a failed one falls back to the type's glyph
 * in the same box, so nothing shifts.
 */
export function RecipientAvatar({ recipient }: RecipientAvatarProps) {
  const { recipient_id: id, recipient_type: type } = recipient;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = recipientKey(recipient);
  const box = characterAvatarBoxClassName(AVATAR_SIZE);

  if (type === 'mailing_list' || failedKey === key) {
    const Glyph = FALLBACK[type];
    return (
      <span
        aria-hidden="true"
        className={cx(box, 'flex items-center justify-center border-line bg-panel-2 text-text-dim')}
      >
        <Glyph size={Icon.ICON_SIZE.sm} />
      </span>
    );
  }

  const onError = () => setFailedKey(key);
  if (type === 'character') {
    return <CharacterAvatar characterId={id} size={AVATAR_SIZE} loading="lazy" onError={onError} />;
  }
  const { px, source } = CHARACTER_AVATAR_SIZE[AVATAR_SIZE];
  return (
    <img
      src={type === 'corporation' ? corporationLogoUrl(id, source) : allianceLogoUrl(id, source)}
      crossOrigin="anonymous"
      alt=""
      aria-hidden="true"
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      onError={onError}
      className={cx(box, 'border-line bg-panel-2')}
    />
  );
}
