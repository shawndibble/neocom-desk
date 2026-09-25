import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { fieldBaseClassName } from '@/components/ui/controlStyles';
import type { EftUnresolvedItem } from '@/engine/fittings/eftLoader';
import type { FitXmlUnresolvedItem, FittingXmlDocument } from '@/engine/import/eveFitXml';
import { parseFittingXmlFile, type FittingXmlDocumentErrorCode } from './fittingXmlDocument';
import {
  resolveFittingXmlOpenAction,
  type FittingXmlListItem,
  type LoadError,
  type ShareDecodeError,
} from './useFittingWorkspace';

interface FittingLoadCardProps {
  onLoad: (text: string) => Promise<void>;
  unresolved: EftUnresolvedItem[];
  fitXmlUnresolved: FitXmlUnresolvedItem[];
  shareError: ShareDecodeError | null;
  loadError: LoadError | null;
  tooLargeToShare: boolean;
  onLoadFittingXmlDocument: (document: FittingXmlDocument) => Promise<FittingXmlListItem[]>;
  onOpenFittingXmlEntry: (item: FittingXmlListItem) => Promise<void>;
}

function WarningList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xs border border-line bg-panel-2 p-2">
      <p className="mb-1 text-xs font-semibold text-text-dim uppercase">{title}</p>
      <ul className="space-y-1 text-xs text-text-dim">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the last Load couldn't place: EFT lines, and a fittings file's
 * unresolved items. Shown in this card, and above the editor once the Load
 * has opened its Fitting — this card is gone by then.
 */
export function LoadWarnings({
  unresolved,
  fitXmlUnresolved,
}: {
  unresolved: EftUnresolvedItem[];
  fitXmlUnresolved: FitXmlUnresolvedItem[];
}) {
  const { t } = useTranslation();
  return (
    <>
      {unresolved.length > 0 && (
        <WarningList
          title={t('fittings.load.unresolvedTitle', { count: unresolved.length })}
          lines={unresolved.map((item) =>
            t('fittings.load.unresolvedLine', {
              line: item.line,
              text: item.text,
              reason: item.reason,
            })
          )}
        />
      )}
      {fitXmlUnresolved.length > 0 && (
        <WarningList
          title={t('fittings.load.xml.unresolvedTitle', { count: fitXmlUnresolved.length })}
          lines={fitXmlUnresolved.map((item) =>
            t('fittings.load.xml.unresolvedLine', { text: item.text, reason: item.reason })
          )}
        />
      )}
    </>
  );
}

export function FittingLoadCard({
  onLoad,
  unresolved,
  fitXmlUnresolved,
  shareError,
  loadError,
  tooLargeToShare,
  onLoadFittingXmlDocument,
  onOpenFittingXmlEntry,
}: FittingLoadCardProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlDocError, setXmlDocError] = useState<FittingXmlDocumentErrorCode | null>(null);
  const [xmlList, setXmlList] = useState<FittingXmlListItem[] | null>(null);

  async function handleLoad() {
    setLoading(true);
    try {
      await onLoad(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleFittingXmlFile(file: File) {
    setXmlLoading(true);
    setXmlDocError(null);
    setXmlList(null);
    try {
      const parsed = await parseFittingXmlFile(file);
      if (!parsed.ok) {
        setXmlDocError(parsed.error.code);
        return;
      }
      const items = await onLoadFittingXmlDocument(parsed.document);
      const action = resolveFittingXmlOpenAction(items);
      if (action.kind === 'open') {
        await onOpenFittingXmlEntry(action.item);
      } else {
        setXmlList(items);
      }
    } finally {
      setXmlLoading(false);
    }
  }

  return (
    <Panel title={t('fittings.load.title')}>
      <div className="space-y-3">
        <label className="block text-xs text-text-dim" htmlFor="fitting-load-text">
          {t('fittings.load.pasteLabel')}
        </label>
        <textarea
          id="fitting-load-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={t('fittings.load.pastePlaceholder')}
          className={`${fieldBaseClassName} w-full p-2 font-mono text-xs`}
        />
        <Button
          size="md"
          variant="primary"
          onClick={() => void handleLoad()}
          disabled={loading || text.trim() === ''}
        >
          {t('fittings.load.button')}
        </Button>

        {shareError && (
          <p role="alert" className="text-xs text-danger">
            {t(`fittings.load.shareError.${shareError}`)}
          </p>
        )}
        {loadError && (
          <p role="alert" className="text-xs text-danger">
            {t(`fittings.load.loadError.${loadError}`)}
          </p>
        )}
        {tooLargeToShare && (
          <p role="alert" className="text-xs text-warning">
            {t('fittings.load.tooLargeToShare')}
          </p>
        )}
        <LoadWarnings unresolved={unresolved} fitXmlUnresolved={[]} />

        <div className="space-y-2 border-t border-line pt-3">
          <label className="block text-xs text-text-dim" htmlFor="fitting-load-xml-file">
            {t('fittings.load.xml.browseLabel')}
          </label>
          <input
            ref={fileInputRef}
            id="fitting-load-xml-file"
            type="file"
            accept=".xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleFittingXmlFile(file);
            }}
          />
          <Button size="md" onClick={() => fileInputRef.current?.click()} disabled={xmlLoading}>
            {t('fittings.load.xml.browse')}
          </Button>

          {xmlDocError && (
            <p role="alert" className="text-xs text-danger">
              {t(`fittings.load.xml.error.${xmlDocError}`)}
            </p>
          )}

          <LoadWarnings unresolved={[]} fitXmlUnresolved={fitXmlUnresolved} />

          {xmlList && (
            <div className="rounded-xs border border-line bg-panel-2 p-2">
              <p className="mb-1 text-xs font-semibold text-text-dim uppercase">
                {t('fittings.load.xml.listTitle')}
              </p>
              <p className="mb-2 text-xs text-text-dim">{t('fittings.load.xml.listNotSaved')}</p>
              <ul className="divide-y divide-line">
                {xmlList.map((item, index) => (
                  <li key={index} className="py-1">
                    {item.fitting ? (
                      <button
                        type="button"
                        className="min-h-11 w-full truncate text-left text-sm text-text hover:text-accent"
                        aria-label={t('fittings.load.xml.open', { name: item.name })}
                        onClick={() => void onOpenFittingXmlEntry(item)}
                      >
                        {item.hullName ? `${item.hullName} — ${item.name}` : item.name}
                      </button>
                    ) : (
                      <div className="text-sm text-text-dim">
                        <p className="truncate">{item.name}</p>
                        <p className="text-xs text-danger">
                          {t('fittings.load.xml.listError', { reason: item.hullError })}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
