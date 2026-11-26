import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Fields, Panel } from '@/components/ui';
import { typeNameOr } from '@/lib/typeNameOr';
import { downloadWorkbook, type WorkbookDownload } from '@/lib/downloadCsv';
import { loadTypes } from '@/sde/loadSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { corpTickerOrId } from '../corpTicker';
import { useActiveCorporationId } from '../owner';
import { readSrpSettings } from '../srpClient';
import { readSrpDoctrines } from '../srpDoctrineClient';
import { readAllSrpClaims, readSrpActivity, SRP_READ_CAP } from '../srpOfficerClient';
import { WorkbookDownloadButton } from '../WorkbookDownloadButton';
import { auditText } from './srpAuditText';
import { srpExportSheets } from './srpExport';

function useSrpExport(): () => Promise<WorkbookDownload> {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  return useCallback(async () => {
    if (characterId === null || corporationId === null) throw new Error('No corporation.');
    const [settings, claims, audit, doctrines, ticker, types, systems] = await Promise.all([
      readSrpSettings(characterId, corporationId),
      readAllSrpClaims(characterId, corporationId),
      readSrpActivity(characterId, corporationId, null),
      readSrpDoctrines(characterId, corporationId),
      corpTickerOrId(corporationId),
      loadTypes(),
      loadSolarSystemsById(),
    ]);
    const sheets = srpExportSheets(
      { settings, claims, audit, doctrines },
      {
        type: (id) => typeNameOr(t, types[id]?.name, id),
        system: (id) => systems?.get(id)?.name ?? t('srp.officer.systemFallback', { id }),
        describe: (entry) => auditText(t, entry),
      },
      t
    );
    return downloadWorkbook('corp-srp', sheets, {
      qualifier: ticker,
      truncated: claims.length >= SRP_READ_CAP || audit.length >= SRP_READ_CAP,
    });
  }, [characterId, corporationId, t]);
}

export function SrpExportButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const build = useSrpExport();
  return (
    <WorkbookDownloadButton label={t('srp.export.action')} build={build} className={className} />
  );
}

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
