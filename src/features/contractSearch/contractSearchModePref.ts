/**
 * Contracts Search's last-used mode (Items/Courier), remembered across visits
 * (issue #1719) — a bare `/contracts` visit always lands on Items otherwise,
 * forcing a hauler back through Items every time they open the page.
 *
 * Restores only the mode itself, not the Search/History tab choice: decision
 * `20260912-141100` and ADR 0015 keep that route unpersisted, and switching
 * between Search and History within one session already keeps the last mode
 * via `usePageTab` (`routes/Contracts.tsx`) — this setting only reaches the
 * case a fresh page load starts cold, where `CONTRACTS_TABS`' hardcoded
 * `search/items` default would otherwise win every time.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { ContractMode } from './ContractSearchPanel';

export const CONTRACT_SEARCH_MODE_KEY = 'contractSearchMode';

/** Items is the landing mode `CONTRACTS_TABS` already hardcodes — restated here as the setting's own default. */
export const DEFAULT_CONTRACT_SEARCH_MODE: ContractMode = 'items';

const MODES: readonly ContractMode[] = ['items', 'courier'];

function isContractMode(raw: unknown): raw is ContractMode {
  return typeof raw === 'string' && (MODES as readonly string[]).includes(raw);
}

export const useContractSearchMode = createLocalSetting<ContractMode>({
  key: CONTRACT_SEARCH_MODE_KEY,
  defaultValue: DEFAULT_CONTRACT_SEARCH_MODE,
  parse: (raw) => (isContractMode(raw) ? raw : null),
});
