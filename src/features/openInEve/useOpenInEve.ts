/**
 * State behind every Open in EVE control: who may send, whether it's sending,
 * and what ESI said. Shared by `OpenInEveMenuItem` and `OpenInEveButton`, so
 * the two can't drift in who may send or what the outcome reads — the same
 * split as `useSetDestination`.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { openInEve, OPEN_IN_EVE_ENDPOINTS, type OpenInEveTarget } from './sendOpenInEve';

type Outcome = { tone: 'status' | 'alert'; text: string } | null;

export interface OpenInEve {
  /** Why sending can't work yet — no Character, or no Open in EVE permission — or null when it can. */
  blockedReason: string | null;
  sending: boolean;
  outcome: Outcome;
  /** No-ops while blocked. */
  send: () => void;
}

export interface OpenInEveLookup {
  /**
   * For a target whose id isn't known yet (a Payee never verified): finds it
   * when pressed, `null` when there is nothing to open. `id` is then ignored.
   */
  resolveId: () => Promise<number | null>;
  /** Shown when `resolveId` finds nothing. */
  unresolvedText: string;
}

export function useOpenInEve({ kind, id }: OpenInEveTarget, lookup?: OpenInEveLookup): OpenInEve {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const lacksScope = useCharacterLacksEndpoints(characterId, OPEN_IN_EVE_ENDPOINTS);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  /** `sending` lags a render behind; two quick selects must not both send. */
  const inFlight = useRef(false);

  const blockedReason =
    characterId === null
      ? t('openInEve.needCharacter')
      : lacksScope
        ? t('openInEve.permissionReason')
        : null;

  async function sendFor(forCharacter: number) {
    inFlight.current = true;
    setSending(true);
    setOutcome(null);
    try {
      const targetId = lookup ? await lookup.resolveId() : id;
      if (targetId === null) {
        setOutcome({ tone: 'alert', text: lookup?.unresolvedText ?? '' });
        return;
      }
      const result = await openInEve(forCharacter, { kind, id: targetId });
      if (result.ok) {
        setOutcome({ tone: 'status', text: t('openInEve.opened') });
      } else {
        const message = result.needsPermission
          ? t('openInEve.needPermission')
          : (result.message ?? t('openInEve.unknownError'));
        setOutcome({ tone: 'alert', text: t('openInEve.failed', { message }) });
      }
    } catch {
      // A lookup that threw (not one that found nothing): say so, don't go quiet.
      setOutcome({
        tone: 'alert',
        text: t('openInEve.failed', { message: t('openInEve.unknownError') }),
      });
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return {
    blockedReason,
    sending,
    outcome,
    send: () => {
      if (characterId !== null && blockedReason === null && !inFlight.current) {
        void sendFor(characterId);
      }
    },
  };
}
