import { appSourceFiles, ratchet } from '@/test/sourceRatchet';

const RAW_DATE_FORMAT =
  /\.toLocaleDateString\(|\.toLocaleTimeString\(|Intl\.DateTimeFormat\((?!\)\.resolvedOptions)|new Date\((?:[^()]|\([^()]*\))*\)\.toLocaleString\(/;

const found = appSourceFiles()
  .filter(({ path, source }) => !path.startsWith('src/lib/') && RAW_DATE_FORMAT.test(source))
  .map(({ path }) => path);

const ALLOWED = [
  'src/engine/mail/mailAge.ts',
  'src/engine/wallet/timeTicks.ts',
  'src/features/character/CalendarClocks.tsx',
  'src/features/character/CalendarDayTicker.tsx',
  'src/features/character/ComingUpRail.tsx',
  'src/features/character/dayLoadLabel.ts',
  'src/features/character/publicInfoStyles.ts',
  'src/features/character/walletJournalDays.ts',
  'src/features/contracts/ContractCells.tsx',
  'src/features/corpTaxBook/noticeFormat.ts',
  'src/features/interactions/InteractionsList.tsx',
  'src/features/interactions/InteractionsTab.tsx',
  'src/features/miningTax/corpBook/CorpBookSyncNote.tsx',
  'src/features/miningTax/HistoryMonthHeader.tsx',
  'src/features/overview/widgets/data/corpPeopleModels.ts',
  'src/features/skills/planner/QueuePeriodGroup.tsx',
  'src/features/survey/localClock.ts',
  'src/features/travel/PilotKillActivity.tsx',
  'src/mockups/corpTaxBookMember.tsx',
  'src/mockups/extractionAutofractureParts.tsx',
];

ratchet('dates formatted outside src/lib/timestamp and src/lib/formatDateTick', found, ALLOWED);
