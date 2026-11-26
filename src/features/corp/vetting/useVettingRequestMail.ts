import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { VettingOverview, VettingReviewSummary } from '@/engine/vetting';
import { useCharacterNames } from '@/features/character/useCharacters';
import { officerCorporationName } from '@/features/corpTaxBook/officerMail';
import { vettingBackend } from './vettingClient';
import {
  buildVettingRequestMail,
  mailGate,
  queueVettingRequestMail,
  requestMailInput,
  type RequestMailRun,
} from './vettingRequestMail';
import { requestLink } from './vettingText';

export interface RequestMailPreview {
  from: string;
  to: string;
  subject: string;
  body: string;
}

type Asked = Pick<VettingReviewSummary, 'id' | 'state' | 'role' | 'pilot' | 'requestMail'>;

export function useVettingRequestMail(
  officerId: number,
  corporationId: number,
  onRecorded: (overview: VettingOverview) => void
): {
  send: (review: Asked) => Promise<RequestMailRun>;
  preview: (review: Asked) => Promise<RequestMailPreview | null>;
} {
  const { t } = useTranslation();
  const names = useCharacterNames();
  const officer = names.get(officerId) ?? '';

  const compose = useCallback(
    async (review: Asked) => {
      const corpName =
        (await officerCorporationName(corporationId)) ?? t('srp.officer.mail.corpFallback');
      return requestMailInput(review, corpName, officer, requestLink());
    },
    [corporationId, officer, t]
  );

  const send = useCallback(
    async (row: Asked): Promise<RequestMailRun> => {
      const none: RequestMailRun = { queued: [], failed: [], missingScope: false };
      try {
        const overview = await vettingBackend().overview(officerId, corporationId);
        const gate = mailGate(overview, row.id, officerId, Date.now());
        if (!gate.ok) {
          onRecorded(overview);
          return gate.reason === 'cooldown' ? { ...none, cooldown: true } : none;
        }
        const review = gate.review;
        const mail = await compose(review);
        if (mail === null) return none;
        const run: RequestMailRun = await queueVettingRequestMail(t, {
          corporationId,
          reviewId: review.id,
          senderCharacterId: officerId,
          pilotId: review.pilot.characterId,
          previousSentAt: gate.previousSentAt,
          mail,
        });
        if (run.queued.length > 0) {
          try {
            onRecorded(
              await vettingBackend().recordRequestMail(officerId, corporationId, review.id)
            );
          } catch {
            return { ...run, unrecorded: true };
          }
        }
        return run;
      } catch {
        return { ...none, failed: [row.pilot.name] };
      }
    },
    [compose, corporationId, officerId, onRecorded, t]
  );

  const preview = useCallback(
    async (review: Asked): Promise<RequestMailPreview | null> => {
      try {
        const mail = await compose(review);
        if (mail === null) return null;
        return {
          from: officer,
          to: review.pilot.name,
          ...buildVettingRequestMail(t, mail),
        };
      } catch {
        return null;
      }
    },
    [compose, officer, t]
  );

  return { send, preview };
}
