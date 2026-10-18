/** Formatting, story parameters and small helpers shared by the Corp Tax Book mockups (#4056). */
import { formatIsk } from '@/lib/isk';
import type { QueueItem } from './corpTaxBookFixtures';

export const PHONE_GLOBALS = { viewport: { value: 'mobile1', isRotated: false } };

/** The shell's default scopes plus standings, so its broker-fee notice stays out of the picture. */
const SHELL_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-characters.read_loyalty.v1',
  'esi-characters.read_standings.v1',
];
export const MOONS_PARAMS = {
  layout: 'fullscreen',
  shell: { path: '/corp/moons', scopes: SHELL_SCOPES },
};
export const MINING_PARAMS = {
  layout: 'fullscreen',
  shell: { path: '/mining/tax', scopes: SHELL_SCOPES },
};

export const isk = (value: number) => formatIsk(value);
export const isk2 = (value: number) => formatIsk(value, 2);

export function queueCounts(items: QueueItem[]) {
  const count = (status: QueueItem['status']) => items.filter((i) => i.status === status).length;
  return {
    sent: count('Sent'),
    failed: count('Failed'),
    paused: count('Paused'),
    waiting: count('Waiting'),
    total: items.length,
  };
}
