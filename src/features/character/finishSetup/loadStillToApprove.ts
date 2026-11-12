/**
 * Gathers what `stillToApprove` reads for one Character, from what the device
 * already knows: its Alerts Grants, the book it last opened as an editor, the
 * hidden corporations and the Not now answers. The one network read is the
 * Character's public affiliation and corporation (no scope), and only when there
 * is a book to offer a corporation to.
 */
import { db } from '@/db';
import { stillToApprove, type Approval } from '@/engine/character/finishSetup';
import { useEditedBookStore } from '@/features/corp/moons/editedBook';
import { useMoonsHiddenCorpsStore } from '@/features/corp/moons/moonsHiddenCorps';
import { findOwnCeoCorps } from '@/features/corp/moons/useOwnCeoCorps';
import { readAlertsGrants } from '@/features/notifications/alertsGrant';
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
  // The editor has to still be on this device to sign the corp onto the book.
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
  return {
    name: character.name,
    items: stillToApprove({
      characterId,
      ...(ceoOf ? { ceoOf } : {}),
      ...(book ? { book } : {}),
      hiddenCorporationIds: hidden,
      alertsOnElsewhere,
      alertsHeld: grants[characterId]?.status === 'active',
      notNow: await readNotNow(characterId),
    }),
  };
}
