import { useRef, useState, type ReactNode } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { isOfflineFailure } from '@/esi/client';
import { Button, entityLinkClassName, Panel, TextArea } from '@/components/ui';
import type { LoadedFitting, LoadOutcome } from '@/engine/fittings/load';
import type { FittingXmlDocument } from '@/engine/import/eveFitXml';
import { parseFittingXmlFile, type FittingXmlDocumentErrorCode } from './fittingXmlDocument';
import { resolveFittingXmlOpenAction, type FittingXmlListItem } from './fittingXmlList';
import type { ShareDecodeError } from '@/engine/fittings/fittingShare';
import { Well } from '@/components/ui/Well';

interface FittingLoadCardProps {
  onLoad: (text: string) => Promise<void>;
  lastLoad: LoadOutcome | null;
  shareError: ShareDecodeError | null;
  tooLargeToShare: boolean;
  onLoadFittingXmlDocument: (document: FittingXmlDocument) => Promise<FittingXmlListItem[]>;
  onOpenLoaded: (loaded: LoadedFitting) => Promise<void>;
  bare?: boolean;
}

function WarningList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Well>
      <p className="mb-1 text-xs font-semibold tracking-widest text-text-dim uppercase">{title}</p>
      <ul className="space-y-1 text-xs text-text-dim">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </Well>
  );
}

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

function classifyThrown(err: unknown): 'offline' | 'unknown' {
  return isOfflineFailure(err) ? 'offline' : 'unknown';
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
  const [thrown, setThrown] = useState<'offline' | 'unknown' | null>(null);

  async function handleLoad() {
    setLoading(true);
    setThrown(null);
    try {
      await onLoad(text);
    } catch (err) {
      setThrown(classifyThrown(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleFittingXmlFile(file: File) {
    setXmlLoading(true);
    setXmlDocError(null);
    setXmlList(null);
    setThrown(null);
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
    } catch (err) {
      setThrown(classifyThrown(err));
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
        <TextArea
          id="fitting-load-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSubmitChord={() => {
            if (!loading && text.trim() !== '') void handleLoad();
          }}
          rows={10}
          placeholder={t('fittings.load.pastePlaceholder')}
          mono
          className="text-xs"
        />
        <Button
          size="md"
          variant="primary"
          onClick={() => void handleLoad()}
          loading={loading}
          aria-disabled={text.trim() === '' || undefined}
        >
          {t('fittings.load.button')}
        </Button>

        {shareError && <InlineError>{t(`fittings.load.shareError.${shareError}`)}</InlineError>}
        {loadError && <InlineError>{t(`fittings.load.loadError.${loadError}`)}</InlineError>}
        {thrown && (
          <InlineError>
            {t(
              thrown === 'offline' ? 'fittings.load.thrownOffline' : 'fittings.load.thrownUnknown'
            )}
          </InlineError>
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
          <Button size="md" onClick={() => fileInputRef.current?.click()} loading={xmlLoading}>
            {t('fittings.load.xml.browse')}
          </Button>

          {xmlDocError && <InlineError>{t(`fittings.load.xml.error.${xmlDocError}`)}</InlineError>}

          {xmlList && (
            <Well>
              <p className="mb-1 text-xs font-semibold tracking-widest text-text-dim uppercase">
                {t('fittings.load.xml.listTitle')}
              </p>
              <p className="mb-2 text-xs text-text-dim">{t('fittings.load.xml.listNotSaved')}</p>
              <ul className="divide-y divide-line">
                {xmlList.map(({ name, hullName, load }, index) => (
                  <li key={index} className="py-1">
                    {load.kind === 'fitting' ? (
                      <button
                        type="button"
                        className={entityLinkClassName('min-h-9 w-full truncate text-left text-sm')}
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
            </Well>
          )}
        </div>
      </div>
    </LoadFrame>
  );
}
