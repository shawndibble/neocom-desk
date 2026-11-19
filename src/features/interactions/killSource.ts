/**
 * Show Info › Interactions, killmails: the other player's latest kills and
 * losses on zKillboard (first page of each, up to 200 — older ones are out of
 * reach), matched against the viewer's Characters. The two lists are the same
 * request the profile already shares (`fetchPilotList`); no per-killmail ESI
 * calls. The mapping is pure; `killSource` is the loading around it.
 */
import type { Interaction } from '@/engine/interactions/interactions';
import { formatIskCompact } from '@/lib/isk';
import type { Translate } from '@/lib/translate';
import { fetchPilotInvolvements, killZkillUrl, type KillInvolvement } from '@/lib/zkillboard';
import type { PersonalSource } from './sourceTypes';

export function killInteractions(
  lists: { kills: readonly KillInvolvement[]; losses: readonly KillInvolvement[] },
  otherId: number,
  characterIds: readonly number[],
  t: Translate
): Interaction[] {
  const mine = new Set(characterIds);
  const out = new Map<number, Interaction>();

  const add = (
    k: KillInvolvement,
    type: 'theyKilledYou' | 'youKilled' | 'sameSide',
    tone: Interaction['tone'],
    characterId: number
  ) => {
    if (out.has(k.killmailId)) return;
    out.set(k.killmailId, {
      id: `kill-${k.killmailId}`,
      kind: 'kill',
      at: k.timeMs,
      type: `interactions.type.${type}`,
      tone,
      title: t(`interactions.kill.title.${type}`),
      detail:
        k.value === null
          ? undefined
          : t('interactions.kill.value', { value: formatIskCompact(k.value) }),
      characterId,
      to: killZkillUrl(k.killmailId),
    });
  };

  // The other pilot is an attacker on every entry of their kills list.
  for (const k of lists.kills) {
    if (k.victimCharacterId !== null && mine.has(k.victimCharacterId)) {
      add(k, 'theyKilledYou', 'danger', k.victimCharacterId);
      continue;
    }
    const ally = k.attackerCharacterIds.find((id) => id !== otherId && mine.has(id));
    if (ally !== undefined) add(k, 'sameSide', 'neutral', ally);
  }
  // The other pilot is the victim on every entry of their losses list.
  for (const k of lists.losses) {
    const killer = k.attackerCharacterIds.find((id) => mine.has(id));
    if (killer !== undefined) add(k, 'youKilled', 'success', killer);
  }
  return [...out.values()];
}

export const killSource: PersonalSource = async ({ characterIds, otherId, t }) => {
  const result = await fetchPilotInvolvements(otherId);
  // A failed zKillboard read is "no data" for this source, not an error for the tab.
  if (!result.ok) return [];
  return killInteractions(result, otherId, characterIds, t);
};
