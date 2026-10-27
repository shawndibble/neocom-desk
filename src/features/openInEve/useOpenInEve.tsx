/**
 * State behind every Open in EVE control: who may send, whether it's sending,
 * and what ESI said. Shared by `OpenInEveMenuItem` and `OpenInEveButton`, so
 * the two can't drift in who may send or what the outcome reads — the same
 * split as `useSetDestination`.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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

/** How long a result stays on screen before it clears itself. */
export const OUTCOME_VISIBLE_MS = 10_000;

type Outcome = { tone: 'status' | 'alert'; text: ReactNode } | null;

const MISSING_GROUPS: readonly ScopeGroup[] = permissionsForEndpoints(OPEN_IN_EVE_ENDPOINTS);
const OPEN_IN_EVE_SCOPES = requiredScopesForEndpoints(OPEN_IN_EVE_ENDPOINTS);

export interface OpenInEve {
  /** Why sending can't work yet — no Character, or no Open in EVE permission — or null when it can. */
  blockedReason: ReactNode;
  /** Sending is blocked only because the browser is offline: the item reads "Needs a connection". */
  offline: boolean;
  /**
   * No Character, or none of the tracked Characters holds the Open in EVE
   * permission (or it isn't known yet): a button hides itself rather than
   * show a reason it can't resolve.
   */
  unavailable: boolean;
  /** The active Character lacks the permission but this other one has it: what "Switch to" offers. */
  switchTo: { id: number; name: string } | null;
  /** Makes `switchTo` the active Character. */
  switchCharacter: () => void;
  /** The Permissions blocking it, for a menu that can't carry a link in its reason; empty otherwise. */
  missingGroups: readonly ScopeGroup[];
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

export interface OpenInEveOptions {
  /**
   * Send from this Character instead of the active one (Settle up's payer).
   * Without the permission it never falls back to another Character: the
   * button stays, blocked, with a link to grant it — unless no Character
   * holds the permission at all, when it hides as usual.
   */
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
  /** Permissions shows the active Character, so a fixed one's grant link switches to it first. */
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
  const [outcome, setOutcome] = useState<Outcome>(null);
  /** `sending` lags a render behind; two quick selects must not both send. */
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
