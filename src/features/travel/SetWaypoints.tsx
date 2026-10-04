/**
 * Set waypoints in game (issue #2479): the button at the right end of Route
 * Safety's facts line, which sends the trip's Stops to a Character's EVE
 * client as autopilot waypoints.
 *
 * The client routes between waypoints by stargate with its own autopilot
 * settings, and cannot fly a wormhole or a bridge, so the waypoints stop at
 * the first such hop's entrance and the result says where to pick up
 * (`engine/route/waypoints.ts`). How each hop was flown is the trip's own
 * row tag (issue #2546): this never loads the stargate graph. A Character whose grant predates the scope
 * sees the button disabled, the reason, and a Grant for that Character.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { GrantBanner } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { db } from '@/db';
import type { EsiEndpointId } from '@/esi/registry';
import { waypointSequence } from '@/engine/route/waypoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { setWaypointsInGame } from './sendWaypoints';
import type { RouteSafetyLeg } from './useRouteSafety';

const ENDPOINTS: readonly EsiEndpointId[] = ['postAutopilotWaypoint'];

type Outcome = { tone: 'status' | 'alert'; text: string } | null;

export function SetWaypoints({
  legs,
  nameOf,
  children,
}: {
  /** The trip's legs: a hole or bridge hop in their rows cuts the waypoints, named as such. */
  legs: readonly RouteSafetyLeg[];
  nameOf: (systemId: number) => string;
  /** The facts line the button closes. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const characters = useLiveQuery(() => db.characters.toArray(), [], []);
  const activeId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const [chosenId, setChosenId] = useState<number | null>(null);
  const characterId =
    chosenId !== null && characters.some((c) => c.characterId === chosenId) ? chosenId : activeId;
  const characterName = characters.find((c) => c.characterId === characterId)?.name;
  const lacksScope = useCharacterLacksEndpoints(characterId, ENDPOINTS);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const blockedReason =
    characterId === null
      ? t('travel.waypoints.needCharacter')
      : lacksScope
        ? t('travel.waypoints.permissionReason')
        : null;

  async function send(id: number) {
    setSending(true);
    setOutcome(null);
    try {
      const { waypoints, cutOff } = waypointSequence(legs);
      /** The cut-off's copy under `group`, naming where it is taken and where to pick up. */
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
        const message = result.needsPermission
          ? t('travel.waypoints.needPermission')
          : (result.message ?? t('travel.waypoints.unknownError'));
        setOutcome({
          tone: 'alert',
          text:
            result.set === 0
              ? t('travel.waypoints.failed', { message })
              : t('travel.waypoints.failedPartway', {
                  set: result.set,
                  total: waypoints.length,
                  message,
                }),
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {children}
        {/* Full width under the facts on a phone, so it reads as the panel's action rather than one more fact. */}
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
          <Button
            size="sm"
            className="max-sm:flex-1"
            disabled={blockedReason !== null || sending}
            title={blockedReason ?? undefined}
            onClick={() => {
              if (characterId !== null) void send(characterId);
            }}
          >
            {sending ? t('travel.waypoints.sending') : t('travel.waypoints.action')}
          </Button>
        </div>
      </div>
      {characterId === null && blockedReason !== null && (
        <p className="text-text-dim sm:text-right">{blockedReason}</p>
      )}
      {lacksScope && characterId !== null && (
        <GrantBanner
          variant="ghost"
          characterId={characterId}
          characterName={characterName}
          endpoints={ENDPOINTS}
          title={t('travel.waypoints.grantTitle')}
          hint={t('travel.waypoints.grantHint')}
          actionLabel={t('travel.waypoints.grantAction')}
        />
      )}
      {outcome && (
        <p
          role={outcome.tone}
          className={outcome.tone === 'alert' ? 'text-danger' : 'text-text-dim'}
        >
          {outcome.text}
        </p>
      )}
    </div>
  );
}
