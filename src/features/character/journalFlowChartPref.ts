import { createLocalSetting } from '@/lib/useLocalSetting';

export const JOURNAL_FLOW_CHART_HIDDEN_KEY = 'walletJournalFlowChartHidden';

export const useJournalFlowChartHidden = createLocalSetting<boolean>({
  key: JOURNAL_FLOW_CHART_HIDDEN_KEY,
  defaultValue: false,
});
