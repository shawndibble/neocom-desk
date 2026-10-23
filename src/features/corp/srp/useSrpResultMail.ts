/**
 * Mails the pilot a claim's result from the active officer's Character (issue #4854). Never
 * throws: whatever goes wrong comes back as a `MailRun` the result line reports.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '@/db';
import { sendMail } from '@/features/character/mail';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import {
  groupByPilot,
  sendSrpResultMails,
  type MailRun,
  type SrpMailClaim,
  type SrpMailKind,
  SEND_MAIL_ENDPOINTS,
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
      if (officerId === null) return { sent: [], failed: [], missingScope: pilots.length > 0 };
      try {
        // Read at send time, so a grant made a moment ago counts. Only `scopes` is taken from the token.
        const scopes = (await db.tokens.get(officerId))?.scopes ?? [];
        const hasScope = requiredScopesForEndpoints(SEND_MAIL_ENDPOINTS).every((scope) =>
          scopes.includes(scope)
        );
        const corpName =
          (corporationId === null ? null : await corporationName(corporationId)) ??
          t('srp.officer.mail.corpFallback');
        return await sendSrpResultMails(
          t,
          { kind, corpName, pilots },
          {
            hasScope,
            send: (recipientId, subject, body) =>
              sendMail(
                officerId,
                [{ recipient_id: recipientId, recipient_type: 'character' }],
                subject,
                body
              ),
          }
        );
      } catch {
        return { sent: [], failed: pilots.map((p) => p.characterName), missingScope: false };
      }
    },
    [officerId, corporationId, t]
  );
}
