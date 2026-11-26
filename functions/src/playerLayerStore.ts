import type { Firestore } from 'firebase-admin/firestore';
import { chunk } from './chunk.js';
import type { PlayerCharacterDoc, PlayerDoc, PlayerLayerStore, PlayerTx } from './playerLayer.js';

export const PLAYERS_COLLECTION = 'players';
export const PLAYER_CHARACTERS_COLLECTION = 'playerCharacters';

const GET_ALL_BATCH = 300;

export function firestorePlayerLayerStore(db: Firestore): PlayerLayerStore {
  const players = db.collection(PLAYERS_COLLECTION);
  const links = db.collection(PLAYER_CHARACTERS_COLLECTION);
  return {
    transact: (fn) =>
      db.runTransaction(async (t) => {
        const tx: PlayerTx = {
          async getLinks(ids) {
            const out = new Map<number, PlayerCharacterDoc>();
            for (const part of chunk(ids, GET_ALL_BATCH)) {
              if (part.length === 0) continue;
              const snaps = await t.getAll(...part.map((id) => links.doc(String(id))));
              for (const s of snaps)
                if (s.exists) out.set(Number(s.id), s.data() as PlayerCharacterDoc);
            }
            return out;
          },
          async getPlayers(ids) {
            const out = new Map<string, PlayerDoc>();
            for (const part of chunk(ids, GET_ALL_BATCH)) {
              if (part.length === 0) continue;
              const snaps = await t.getAll(...part.map((id) => players.doc(id)));
              for (const s of snaps) if (s.exists) out.set(s.id, s.data() as PlayerDoc);
            }
            return out;
          },
          setLink: (doc) => void t.set(links.doc(String(doc.characterId)), doc),
          deleteLink: (id) => void t.delete(links.doc(String(id))),
          setPlayer: (doc) => void t.set(players.doc(doc.id), doc),
          deletePlayer: (id) => void t.delete(players.doc(id)),
        };
        return fn(tx);
      }),
  };
}

export async function provenCharacterIds(
  db: Firestore,
  characterIds: readonly number[]
): Promise<Set<number>> {
  const proven = new Set<number>();
  const unique = [...new Set(characterIds)];
  for (const part of chunk(unique, GET_ALL_BATCH)) {
    const snaps = await db.getAll(
      ...part.map((id) => db.collection(PLAYER_CHARACTERS_COLLECTION).doc(String(id)))
    );
    for (const s of snaps) if (s.exists) proven.add(Number(s.id));
  }
  return proven;
}
