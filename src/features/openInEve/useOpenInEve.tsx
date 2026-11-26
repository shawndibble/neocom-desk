import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Outcome } from '@/components/OutcomeNote';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { useCharacterIdsWithScopes, useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useCharacterNames } from '@/features/character/useCharacters';
import {
  permissionsForEndpoints,
  requiredScopesForEndpoints,
  type ScopeGroup,
} from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { openInEve, OPEN_IN_EVE_ENDPOINTS, type OpenInEveTarget } from './sendOpenInEve';

export const OUTCOME_VISIBLE_MS = 10_000;

const MISSING_GROUPS: readonly ScopeGroup[] = permissionsForEndpoints(OPEN_IN_EVE_ENDPOINTS);
const OPEN_IN_EVE_SCOPES = requiredScopesForEndpoints(OPEN_IN_EVE_ENDPOINTS);

export interface OpenInEve {
  blockedReason: ReactNode;
  offline: boolean;
  unavailable: boolean;
  switchTo: { id: number; name: string } | null;
  switchCharacter: () => void;
  missingGroups: readonly ScopeGroup[];
  sending: boolean;
  outcome: Outcome | null;
  send: () => void;
}

export interface OpenInEveLookup {
  resolveId: () => Promise<number | null>;
  unresolvedText: string;
}

export interface OpenInEveOptions {
  characterId?: number;
}

export function useOpenInEve(
  { kind, id }: OpenInEveTarget,
  lookup?: OpenInEveLookup,
  options?: OpenInEveOptions
): OpenInEve {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const fixedCharacter = options?.characterId !== undefined;
  const characterId = options?.characterId ?? activeCharacterId;
  const grantLink = (
    <GrantMissingLink
      groups={MISSING_GROUPS}
      asCharacter={
        fixedCharacter && characterId !== activeCharacterId ? (characterId ?? undefined) : undefined
      }
    />
  );
  const lacksScope = useCharacterLacksEndpoints(characterId, OPEN_IN_EVE_ENDPOINTS);
  const online = useOnline();
  const holders = useCharacterIdsWithScopes(OPEN_IN_EVE_SCOPES);
  const names = useCharacterNames();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (outcome === null) return;
    const timer = setTimeout(() => setOutcome(null), OUTCOME_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  const otherId =
    !fixedCharacter &&
    lacksScope &&
    holders !== undefined &&
    characterId !== null &&
    names.has(characterId)
      ? [...holders].find((id) => id !== characterId && names.has(id))
      : undefined;
  const switchTo = otherId === undefined ? null : { id: otherId, name: names.get(otherId) ?? '' };
  const switchCharacter = () => {
    if (switchTo !== null) void useActiveCharacter.getState().setActiveCharacter(switchTo.id);
  };

  const blockedReason =
    characterId === null ? (
      t('openInEve.needCharacter')
    ) : lacksScope ? (
      switchTo ? (
        <>
          {t('openInEve.notGranted', { name: names.get(characterId) ?? '' })}{' '}
          <button type="button" className={inlineLinkClassName} onClick={switchCharacter}>
            {t('openInEve.switchTo', { name: switchTo.name })}
          </button>
        </>
      ) : fixedCharacter ? (
        <>
          {t('openInEve.notGranted', { name: names.get(characterId) ?? '' })} {grantLink}
        </>
      ) : (
        grantLink
      )
    ) : !online ? (
      t('common.needsConnection')
    ) : null;

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
      } else if (result.offline) {
        setOutcome({
          tone: 'alert',
          text: result.unconfirmed ? t('openInEve.unconfirmed') : t('openInEve.offline'),
        });
      } else {
        setOutcome({
          tone: 'alert',
          text: result.needsPermission
            ? grantLink
            : t('openInEve.failed', { message: result.message ?? t('openInEve.unknownError') }),
        });
      }
    } catch {
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
    unavailable:
      characterId === null ||
      (lacksScope &&
        (fixedCharacter
          ? holders === undefined || ![...holders].some((holder) => names.has(holder))
          : switchTo === null)),
    switchTo,
    switchCharacter,
    offline: characterId !== null && !lacksScope && !online,
    missingGroups: lacksScope && characterId !== null ? MISSING_GROUPS : [],
    sending,
    outcome,
    send: () => {
      if (characterId !== null && blockedReason === null && !inFlight.current) {
        void sendFor(characterId);
      }
    },
  };
}
