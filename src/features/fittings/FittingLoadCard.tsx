import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { fieldBaseClassName } from '@/components/ui/controlStyles';
import type { LoadedFitting, LoadOutcome } from '@/engine/fittings/load';
import type { FittingXmlDocument } from '@/engine/import/eveFitXml';
import { parseFittingXmlFile, type FittingXmlDocumentErrorCode } from './fittingXmlDocument';
import {
  resolveFittingXmlOpenAction,
  type FittingXmlListItem,
  type ShareDecodeError,
} from './useFittingWorkspace';

interface FittingLoadCardProps {
  onLoad: (text: string) => Promise<void>;
  lastLoad: LoadOutcome | null;
  shareError: ShareDecodeError | null;
  tooLargeToShare: boolean;
  onLoadFittingXmlDocument: (document: FittingXmlDocument) => Promise<FittingXmlListItem[]>;
  onOpenLoaded: (loaded: LoadedFitting) => Promise<void>;
  /** No panel chrome of its own, for a host that already has a title (a dialog). */
  bare?: boolean;
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
 * What the last Load couldn't place: pasted lines, a fittings file's items,
 * an In-game Fitting's unsupported slots. Shown in this card, and above the
 * editor once the Load has opened its Fitting — this card is gone by then.
 */
export function LoadWarnings({ load }: { load: LoadOutcome | null }) {
  const { t } = useTranslation();
  if (load === null || load.unresolved.length === 0) return null;
  const count = load.unresolved.length;
  const title =
    load.source === 'text'
      ? t('fittings.load.unresolvedTitle', { count })
      : load.source === 'file'
        ? t('fittings.load.xml.unresolvedTitle', { count })
        : t('fittings.load.inGame.unresolvedTitle', { count });
  return (
    <WarningList
      title={title}
      lines={load.unresolved.map((item) =>
        item.line === undefined
          ? t('fittings.load.unresolvedItem', { text: item.text, reason: item.reason })
          : t('fittings.load.unresolvedLine', {
              line: item.line,
              text: item.text,
              reason: item.reason,
            })
      )}
    />
  );
}

function LoadFrame({
  bare,
  title,
  children,
}: {
  bare: boolean;
  title: string;
  children: ReactNode;
}) {
  return bare ? <>{children}</> : <Panel title={title}>{children}</Panel>;
}

export function FittingLoadCard({
  onLoad,
  lastLoad,
  shareError,
  tooLargeToShare,
  onLoadFittingXmlDocument,
  onOpenLoaded,
  bare = false,
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
        await onOpenLoaded(action.loaded);
      } else {
        setXmlList(items);
      }
    } finally {
      setXmlLoading(false);
    }
  }

  const loadError = lastLoad?.kind === 'failed' ? lastLoad.error : null;

  return (
    <LoadFrame bare={bare} title={t('fittings.load.title')}>
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
        <LoadWarnings load={lastLoad} />

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

          {xmlList && (
            <div className="rounded-xs border border-line bg-panel-2 p-2">
              <p className="mb-1 text-xs font-semibold text-text-dim uppercase">
                {t('fittings.load.xml.listTitle')}
              </p>
              <p className="mb-2 text-xs text-text-dim">{t('fittings.load.xml.listNotSaved')}</p>
              <ul className="divide-y divide-line">
                {xmlList.map(({ name, hullName, load }, index) => (
                  <li key={index} className="py-1">
                    {load.kind === 'fitting' ? (
                      <button
                        type="button"
                        className="min-h-11 w-full truncate text-left text-sm text-text hover:text-accent"
                        aria-label={t('fittings.load.xml.open', { name })}
                        onClick={() => void onOpenLoaded(load)}
                      >
                        {hullName ? `${hullName} — ${name}` : name}
                      </button>
                    ) : (
                      <div className="text-sm text-text-dim">
                        <p className="truncate">{name}</p>
                        <p className="text-xs text-danger">
                          {t('fittings.load.xml.listError', { reason: load.unresolved[0]?.reason })}
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
    </LoadFrame>
  );
}
