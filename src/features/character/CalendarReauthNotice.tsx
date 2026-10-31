import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { beginGrant } from '@/app/grantAction';
import type { CharacterBoardItemKind } from '@/engine/character/board';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';
import { KIND_LABEL } from './calendarKindLabels';
import { KIND_ENDPOINTS } from './calendarKindEndpoints';

const dismissKey = (characterId: number) => `calendarReauthDismissed:${characterId}`;

function readDismissed(characterId: number): CharacterBoardItemKind[] {
  try {
    const parsed: unknown = JSON.parse(readLocal(dismissKey(characterId)) ?? '[]');
    return Array.isArray(parsed) ? (parsed as CharacterBoardItemKind[]) : [];
  } catch {
    return [];
  }
}

interface CalendarReauthNoticeProps {
  characterId: number;
  /** Sources whose last read came back refused. */
  kinds: readonly CharacterBoardItemKind[];
}

/**
 * The line above the calendar panes naming sources that need a new login, with
 * the two things a pilot can do about it: log in again, or dismiss it for good.
 *
 * A dismissal is per Character and per source, remembered on this device
 * (storage blocked: it comes back next load). A different source being
 * refused later still shows, since the pilot never dismissed that one.
 */
export function CalendarReauthNotice({ characterId, kinds }: CalendarReauthNoticeProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => readDismissed(characterId));
  const [forCharacter, setForCharacter] = useState(characterId);
  if (forCharacter !== characterId) {
    setForCharacter(characterId);
    setDismissed(readDismissed(characterId));
  }

  const shown = kinds.filter((kind) => !dismissed.includes(kind));
  if (shown.length === 0) return null;

  const dismiss = () => {
    const next = [...new Set([...dismissed, ...shown])];
    writeLocal(dismissKey(characterId), JSON.stringify(next));
    setDismissed(next);
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-warning">
      <p className="min-w-0">
        {t('calendar.sourcesNeedLogin', {
          sources: shown.map((kind) => t(KIND_LABEL[kind])).join(', '),
        })}
      </p>
      <Button
        size="sm"
        onClick={() =>
          void beginGrant(
            characterId,
            shown.flatMap((kind) => KIND_ENDPOINTS[kind])
          )
        }
      >
        {t('calendar.reauthNoticeAction')}
      </Button>
      <Button size="sm" onClick={dismiss}>
        {t('reauth.dismiss')}
      </Button>
    </div>
  );
}
