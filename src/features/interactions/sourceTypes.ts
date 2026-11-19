/**
 * The contract between Show Info › Interactions and the per-record sources that
 * feed it (`walletSource`, `contractSource`, `mailSource`, `killSource`,
 * `corpSources`). A source reads only what this device or this account can
 * already see (Dexie caches, ESI the Character is granted, zKillboard, the corp
 * book); it never asks for a new grant, and a source that has no access or no
 * data returns `[]`, not an error.
 */
import type { Interaction } from '@/engine/interactions/interactions';
import type { Translate } from '@/lib/translate';

/** Personal scopes: this Character, or all of them. */
export interface PersonalQuery {
  /** The player whose Show Info is open. */
  otherId: number;
  /** The player's name, for row text. */
  otherName: string;
  /** The viewer's Characters in play (one for "This character"). */
  characterIds: readonly number[];
  t: Translate;
}

/** The corporation scope: what the viewer's account can see for the corp. */
export interface CorpQuery {
  otherId: number;
  otherName: string;
  corporationId: number;
  /** The viewer's Characters, for the roles and grants the corp reads need. */
  characterIds: readonly number[];
  t: Translate;
}

export type PersonalSource = (query: PersonalQuery) => Promise<Interaction[]>;
export type CorpSource = (query: CorpQuery) => Promise<Interaction[]>;

/**
 * `Interaction.to` is a same-app path with its search (`/contracts?highlight=7`),
 * opened as a normal navigation so Back returns to the modal. An absolute
 * `https://` value (a zKillboard killmail) opens in a new tab instead.
 */
