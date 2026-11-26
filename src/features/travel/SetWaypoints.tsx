import { useCharacters } from '@/features/character/useCharacters';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeNote, type Outcome } from '@/components/OutcomeNote';
import { useNavigate } from 'react-router-dom';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { grantMissingPath } from '@/app/grantMissingPath';
import { beginGrant } from '@/app/grantAction';
import { useCharacterIdsWithScopes, useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import {
  Button,
  NeedsConnection,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
} from '@/components/ui';
import {
  permissionsForEndpoints,
  requiredScopesForEndpoints,
  type EsiEndpointId,
} from '@/esi/registry';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { waypointSequence } from '@/engine/route/waypoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { MESSAGE_MS } from '@/components/ui/useTimedToast';
import { useWaypointsDismissed } from './waypointsDismissed';
import { setWaypointsInGame } from './sendWaypoints';
import { waypointFailureText } from './waypointFailureText';
import type { RouteSafetyLeg } from './useRouteSafety';

const ENDPOINTS: readonly EsiEndpointId[] = ['postAutopilotWaypoint'];

export function SetWaypoints({
  legs,
  nameOf,
  children,
}: {
  legs: readonly RouteSafetyLeg[];
  nameOf: (systemId: number) => string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characters = useCharacters();
  const activeId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const [chosenId, setChosenId] = useState<number | null>(null);
  const characterId =
    chosenId !== null && characters.some((c) => c.characterId === chosenId) ? chosenId : activeId;
  const characterName = characters.find((c) => c.characterId === characterId)?.name;
  const lacksScope = useCharacterLacksEndpoints(characterId, ENDPOINTS);
  const online = useOnline();
  const dismissed = useWaypointsDismissed((state) => state.value);
  const setDismissed = useWaypointsDismissed((state) => state.setValue);
  useHydratedStore(useWaypointsDismissed);
  const holders = useCharacterIdsWithScopes(requiredScopesForEndpoints(ENDPOINTS));
  const hidden =
    dismissed &&
    characters.length > 0 &&
    (holders === undefined || holders.size === 0 || lacksScope);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const blockedReason =
    characterId === null
      ? t('travel.waypoints.needCharacter')
      : lacksScope
        ? t('permissions.grantMissing')
        : !online
          ? t('common.needsConnection')
          : null;

  async function send(id: number) {
    setSending(true);
    setOutcome(null);
    try {
      const { waypoints, cutOff } = waypointSequence(legs);
      const cutOffText = (group: 'nothing' | 'cutOff') =>
        cutOff &&
        t(`travel.waypoints.${group}.${cutOff.kind}`, {
          entrance: nameOf(cutOff.entrance),
          exit: nameOf(cutOff.exit),
        });
      if (waypoints.length === 0) {
        setOutcome({
          tone: 'status',
          text: cutOffText('nothing') ?? t('travel.waypoints.nothingToSet'),
        });
        return;
      }
      const result = await setWaypointsInGame(id, waypoints);
      if (!result.ok) {
        setOutcome({
          tone: 'alert',
          text: waypointFailureText(t, result, waypoints.length) ?? (
            <GrantMissingLink groups={permissionsForEndpoints(ENDPOINTS)} />
          ),
        });
        return;
      }
      setOutcome({
        tone: 'status',
        text: cutOffText('cutOff') ?? t('travel.waypoints.done'),
      });
    } finally {
      setSending(false);
    }
  }

  const sendButton = (
    <Button
      size="sm"
      className="max-sm:flex-1"
      aria-disabled={blockedReason !== null || undefined}
      loading={sending}
      onClick={() => {
        if (blockedReason === null && characterId !== null) void send(characterId);
      }}
    >
      {sending ? t('travel.waypoints.sending') : t('travel.waypoints.action')}
    </Button>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {children}
        {!hidden && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {characters.length > 1 && characterId !== null && (
              <Select
                value={String(characterId)}
                onValueChange={(value) => {
                  setChosenId(Number(value));
                  setOutcome(null);
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t('travel.waypoints.character')}
                  className="w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {characters.map((character) => (
                    <SelectItem key={character.characterId} value={String(character.characterId)}>
                      {character.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Tooltip content={lacksScope ? null : blockedReason}>{sendButton}</Tooltip>
          </div>
        )}
      </div>
      {blockedReason !== null && !lacksScope && !hidden && (
        <p className="text-text-dim sm:text-right">{blockedReason}</p>
      )}
      {lacksScope && characterId !== null && !hidden && (
        <div className="space-y-2 py-2">
          <p className="text-xs font-semibold tracking-widest text-warning uppercase">
            {t('travel.waypoints.grantTitle', { character: characterName ?? '' })}
          </p>
          <p className="text-xs text-text-dim">{t('travel.waypoints.grantHint')}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <NeedsConnection>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void beginGrant(characterId, ENDPOINTS)}
              >
                {t('travel.waypoints.grantAction')}
              </Button>
            </NeedsConnection>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void useActiveCharacter.getState().setActiveCharacter(characterId);
                navigate(grantMissingPath(permissionsForEndpoints(ENDPOINTS)));
              }}
            >
              {t('travel.waypoints.manageAction')}
            </Button>
            <Tooltip content={t('travel.waypoints.dismissHint')}>
              <Button variant="ghost" size="sm" onClick={() => void setDismissed(true)}>
                {t('travel.waypoints.dismissAction')}
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
      <OutcomeNote outcome={outcome} durationMs={MESSAGE_MS} as="p" />
    </div>
  );
}
