/**
 * Whether the Journal panel's daily In / Out chart (#3914) is hidden. Shown by
 * default; "Hide chart" is remembered on this device, like the other view
 * preferences `VIEW_PREFERENCE_KEYS` clears.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const JOURNAL_FLOW_CHART_HIDDEN_KEY = 'walletJournalFlowChartHidden';

export const useJournalFlowChartHidden = createLocalSetting<boolean>({
  key: JOURNAL_FLOW_CHART_HIDDEN_KEY,
  defaultValue: false,
});
