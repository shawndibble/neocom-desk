/**
 * Mails the pilot a claim's result from the active officer's Character, by the paced Officer mail queue. Never
 * throws: whatever goes wrong comes back as a `MailRun` the result line reports.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import {
  groupByPilot,
  queueSrpResultMails,
  type MailRun,
  type SrpMailClaim,
  type SrpMailKind,
} from './srpResultMail';

export interface DecidedClaim {
  characterId: number | null;
  characterName: string | null;
  claim: SrpMailClaim;
}

async function corporationName(corporationId: number): Promise<string | null> {
  try {
    const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
    return (await loadPublicCorporationRecord(corporationId))?.name ?? null;
  } catch {
    return null;
  }
}

export function useSrpResultMail(): (
  kind: SrpMailKind,
  decided: readonly DecidedClaim[]
) => Promise<MailRun> {
  const { t } = useTranslation();
  const officerId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  return useCallback(
    async (kind, decided) => {
      const pilots = groupByPilot(decided);
      if (officerId === null) return { queued: [], failed: [], missingScope: pilots.length > 0 };
      try {
        const corpName =
          (corporationId === null ? null : await corporationName(corporationId)) ??
          t('srp.officer.mail.corpFallback');
        return await queueSrpResultMails(t, {
          kind,
          corpName,
          pilots,
          senderCharacterId: officerId,
          corporationId,
        });
      } catch {
        return { queued: [], failed: pilots.map((p) => p.characterName), missingScope: false };
      }
    },
    [officerId, corporationId, t]
  );
}
