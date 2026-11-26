import { db } from '@/db';
import { stillToApprove, type Approval } from '@/engine/character/finishSetup';
import { useEditedBookStore } from '@/features/corp/moons/editedBook';
import { useMoonsHiddenCorpsStore } from '@/features/corp/moons/moonsHiddenCorps';
import { findOwnCeoCorps } from '@/features/corp/moons/useOwnCeoCorps';
import { readAlertsGrants } from '@/features/notifications/alertsGrant';
import { planAlertsStepFor } from '@/features/notifications/alertsStepFor';
import { readNotNow } from './finishSetupStore';

export async function loadStillToApprove(
  characterId: number
): Promise<{ name: string; items: Approval[] } | null> {
  const character = await db.characters.get(characterId);
  if (!character) return null;
  const grants = await readAlertsGrants();
  const alertsOnElsewhere = Object.entries(grants).some(
    ([id, grant]) => Number(id) !== characterId && grant.status === 'active'
  );
  const bookStore = useEditedBookStore.getState();
  if (!bookStore.hydrated) await bookStore.hydrate();
  let book = useEditedBookStore.getState().value ?? undefined;
  if (book && !(await db.characters.get(book.editorCharacterId))) book = undefined;
  let ceoOf: { corporationId: number; name: string } | undefined;
  let hidden: number[] = [];
  if (book) {
    const [corp] = await findOwnCeoCorps([character], undefined).catch(() => []);
    if (corp?.ceoCharacterId === characterId) {
      ceoOf = { corporationId: corp.corporationId, name: corp.name };
    }
    await useMoonsHiddenCorpsStore.getState().hydrate();
    hidden = useMoonsHiddenCorpsStore.getState().value.hidden;
  }
  const items = stillToApprove({
    characterId,
    ...(ceoOf ? { ceoOf } : {}),
    ...(book ? { book } : {}),
    hiddenCorporationIds: hidden,
    alertsOnElsewhere,
    alertsHeld: grants[characterId]?.status === 'active',
    notNow: await readNotNow(characterId),
  });
  const planned = await Promise.all(
    items.map(async (item) => {
      if (item.kind !== 'alerts') return item;
      const step = await planAlertsStepFor(characterId, { location: true, mail: true });
      return { ...item, nearby: step.nearby, mail: step.mail };
    })
  );
  return { name: character.name, items: planned };
}
