/**
 * Mails the pilot a claim's result from the active officer's Character, by the paced Officer mail queue. Never
 * throws: whatever goes wrong comes back as a `MailRun` the result line reports.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { officerCorporationName, type MailRun } from '@/features/corpTaxBook/officerMail';
import {
  groupByPilot,
  queueSrpResultMails,
  type SrpMailClaim,
  type SrpMailKind,
} from './srpResultMail';

export interface DecidedClaim {
  characterId: number | null;
  characterName: string | null;
  claim: SrpMailClaim;
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
          (corporationId === null ? null : await officerCorporationName(corporationId)) ??
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
