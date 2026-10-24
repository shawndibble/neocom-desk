/**
 * The SRP export (#4946): one workbook with Settings, every SRP Claim, the SRP log and the
 * Doctrine Fits. In SRP Settings for Directors, and on the Queue for every officer who works it
 * (an Accountant included): the rules let any SRP officer read all four, so no new reach.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Fields, Panel } from '@/components/ui';
import { downloadWorkbook, type WorkbookDownload } from '@/lib/downloadCsv';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { corpTickerOrId } from '../corpTicker';
import { useActiveCorporationId } from '../owner';
import { readSrpSettings } from '../srpClient';
import { readSrpDoctrines } from '../srpDoctrineClient';
import { readAllSrpActivity, readAllSrpClaims } from '../srpOfficerClient';
import { WorkbookDownloadButton } from '../WorkbookDownloadButton';
import { auditText } from './srpAuditText';
import { srpExportSheets } from './srpExport';
import { useSrpClaimNames } from './useSrpClaimNames';

function useSrpExport(): () => Promise<WorkbookDownload> {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const names = useSrpClaimNames();
  return useCallback(async () => {
    if (characterId === null || corporationId === null) throw new Error('No corporation.');
    const [settings, claims, audit, doctrines, ticker] = await Promise.all([
      readSrpSettings(characterId, corporationId),
      readAllSrpClaims(characterId, corporationId),
      readAllSrpActivity(characterId, corporationId),
      readSrpDoctrines(characterId, corporationId),
      corpTickerOrId(corporationId),
    ]);
    const sheets = srpExportSheets(
      { settings, claims, audit, doctrines },
      { type: names.hull, system: names.system, describe: (entry) => auditText(t, entry) },
      t
    );
    return downloadWorkbook('corp-srp', sheets, { qualifier: ticker });
  }, [characterId, corporationId, names, t]);
}

/** The download alone: the Queue's header carries it beside the summary line. */
export function SrpExportButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const build = useSrpExport();
  return (
    <WorkbookDownloadButton label={t('srp.export.action')} build={build} className={className} />
  );
}

/** The Export panel at the foot of SRP Settings, laid out like the editor's own fields. */
export function SrpExportPanel() {
  const { t } = useTranslation();
  return (
    <Panel title={t('srp.export.title')}>
      <Fields variant="form">
        <Field
          label={t('srp.export.label')}
          note={`${t('srp.export.hint')} ${t('srp.export.sheetList')}`}
        >
          <SrpExportButton className="w-full" />
        </Field>
      </Fields>
    </Panel>
  );
}
