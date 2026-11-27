import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

const RAW_DATE_FORMAT =
  /\.toLocaleDateString\(|\.toLocaleTimeString\(|Intl\.DateTimeFormat\((?!\)\.resolvedOptions)|new Date\((?:[^()]|\([^()]*\))*\)\.toLocaleString\(/;

const found = sourceFiles(join(root, 'src'))
  .map((file) => file.slice(root.length + 1))
  .filter((file) => !file.startsWith('src/lib/'))
  .filter((file) => RAW_DATE_FORMAT.test(readFileSync(join(root, file), 'utf8')))
  .sort();

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

describe('dates formatted outside src/lib/timestamp and src/lib/formatDateTick', () => {
  it('no new file', () => {
    expect(found.filter((f) => !ALLOWED.includes(f))).toEqual([]);
  });

  it('allowlist lists only current offenders', () => {
    expect(ALLOWED.filter((f) => !found.includes(f))).toEqual([]);
  });
});
