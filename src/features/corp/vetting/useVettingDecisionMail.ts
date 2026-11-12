/**
 * Mails a pilot how their vetting review was decided, from the active reviewer's Character, by
 * the paced Officer mail queue. Never throws: whatever goes wrong comes back as a `MailRun`.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { VettingRejection, VettingReview } from '@/engine/vetting';
import type { MailRun } from '../srp/srpResultMail';
import { officerCorporationName } from '../srp/useSrpResultMail';
import { decisionMailInput, queueVettingDecisionMail } from './vettingDecisionMail';

export function useVettingDecisionMail(
  reviewerId: number
): (review: VettingReview, rejection: VettingRejection) => Promise<MailRun> {
  const { t } = useTranslation();
  return useCallback(
    async (review, rejection) => {
      const none: MailRun = { queued: [], failed: [], missingScope: false };
      try {
        const corpName =
          (await officerCorporationName(review.corporationId)) ??
          t('srp.officer.mail.corpFallback');
        const mail = decisionMailInput(review, rejection, corpName);
        if (mail === null) return none;
        return await queueVettingDecisionMail(t, {
          corporationId: review.corporationId,
          reviewId: review.id,
          senderCharacterId: reviewerId,
          pilotId: review.pilot.characterId,
          mail,
        });
      } catch {
        return { ...none, failed: [review.pilot.name] };
      }
    },
    [reviewerId, t]
  );
}
