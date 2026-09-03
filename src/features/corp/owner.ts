/**
 * Whose data a page is showing, and whether the choice may be offered at all
 * (issue #298).
 *
 * The rule this module exists to enforce is the hide rule (CONTEXT.md round
 * 35): for a Character without the capability the switch **does not render**.
 * No lock, no disabled control, no explanation — the page looks exactly as it
 * does today. Every page that offers the switch asks `available` here rather
 * than composing `useCorpAccess` with a capability and a corporation id three
 * separate ways.
 *
 * `corporationId` is part of the gate, not an extra. It is written by
 * `recordCharacterCorporation` from the public-info read, so on a cold start it
 * is simply absent — and a switch whose corp side would have no corporation to
 * read is a switch that must not be on screen yet.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { CorpCapability } from '@/engine/corpRoles';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess } from './useCorpAccess';

/** Which owner's rows a page's table is showing. */
export type DataOwner = 'personal' | 'corporation';

export interface CorpOwnerSelection {
  owner: DataOwner;
  setOwner: (owner: DataOwner) => void;
  /** Render the switch only when true. False renders nothing at all — see the hide rule. */
  available: boolean;
  /** The corporation the corp side reads. Never null while `available`. */
  corporationId: number | null;
}

/**
 * The active Character's corporation, live from Dexie.
 *
 * `undefined` (never learned) and "no active Character" both answer null: both
 * mean there is no corporation to read, which is the only distinction any
 * caller here makes.
 */
export function useActiveCorporationId(): number | null {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useLiveQuery(async () => {
    if (activeCharacterId === null) return null;
    return (await db.characters.get(activeCharacterId))?.corporationId ?? null;
  }, [activeCharacterId]);
  return corporationId ?? null;
}

/**
 * Personal/Corporation selection for one page, for the capability that page's
 * corp side needs.
 *
 * Device-local and per page by construction — plain component state, never
 * written to Dexie and never synced — and it resets to Personal when the active
 * Character changes, because the next Character may hold no corp role at all
 * and must not land on a corp view it cannot read.
 */
export function useCorpOwner(capability: CorpCapability): CorpOwnerSelection {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const access = useCorpAccess();
  const corporationId = useActiveCorporationId();

  const [selection, setSelection] = useState<{ characterId: number | null; owner: DataOwner }>({
    characterId: activeCharacterId,
    owner: 'personal',
  });

  // Adjusting state during render, as `useRouteSnapshot` does for the same
  // event: an effect would render one frame of the previous Character's corp
  // view under the new Character's name.
  if (selection.characterId !== activeCharacterId) {
    setSelection({ characterId: activeCharacterId, owner: 'personal' });
  }

  const available =
    access.state === 'ready' && access.capabilities[capability] && corporationId !== null;

  return {
    // Forced back to Personal whenever the switch is not available, so a corp
    // view can never be left on screen by a state change that removed the
    // control that got there — a revoked grant, a lost role, an unresolved
    // corporation.
    owner: available ? selection.owner : 'personal',
    setOwner: (owner) => setSelection({ characterId: activeCharacterId, owner }),
    available,
    corporationId,
  };
}
