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

  for (const k of lists.kills) {
    if (k.victimCharacterId !== null && mine.has(k.victimCharacterId)) {
      add(k, 'theyKilledYou', 'danger', k.victimCharacterId);
      continue;
    }
    const ally = k.attackerCharacterIds.find((id) => id !== otherId && mine.has(id));
    if (ally !== undefined) add(k, 'sameSide', 'neutral', ally);
  }
  for (const k of lists.losses) {
    const killer = k.attackerCharacterIds.find((id) => mine.has(id));
    if (killer !== undefined) add(k, 'youKilled', 'success', killer);
  }
  return [...out.values()];
}

export const killSource: PersonalSource = async ({ characterIds, otherId, t }) => {
  const result = await fetchPilotInvolvements(otherId);
  if (!result.ok) return [];
  return killInteractions(result, otherId, characterIds, t);
};
