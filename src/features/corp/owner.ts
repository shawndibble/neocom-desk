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
import { useEffect, useRef } from 'react';
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
 * `owner`/`setOwner` are controlled by the caller — `Wallet.tsx` backs them
 * with its `?owner=` query param (ADR 0015, issue #1302), so a deep link
 * (the vitals rail's division link, issue #419), Back/Forward, and a pasted
 * link all reach the matching view the same way every other short-lived view
 * state on that page does. This hook adds the two rules a bare URL param
 * can't express: forced back to Personal whenever the switch would not even
 * be offered, and reset to Personal on a Character switch, because the next
 * Character may hold no corp role at all and must not land on a corp view it
 * cannot read.
 */
export function useCorpOwner(
  capability: CorpCapability,
  owner: DataOwner,
  setOwner: (owner: DataOwner) => void
): CorpOwnerSelection {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const access = useCorpAccess();
  const corporationId = useActiveCorporationId();

  // An effect, not a render-time adjustment: `setOwner` writes to the URL
  // (a real navigation), which is a side effect and must not run during
  // render. The ref skips the reset on mount — only a *change* of Character
  // clears the selection.
  const lastCharacterId = useRef(activeCharacterId);
  useEffect(() => {
    if (lastCharacterId.current !== activeCharacterId) {
      lastCharacterId.current = activeCharacterId;
      setOwner('personal');
    }
  }, [activeCharacterId, setOwner]);

  const available =
    access.state === 'ready' && access.capabilities[capability] && corporationId !== null;

  return {
    // Forced back to Personal whenever the switch is not available, so a corp
    // view can never be left on screen by a state change that removed the
    // control that got there — a revoked grant, a lost role, an unresolved
    // corporation.
    owner: available ? owner : 'personal',
    setOwner,
    available,
    corporationId,
  };
}
