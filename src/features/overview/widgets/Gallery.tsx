/**
 * The Gallery: "Add a widget". A 460px drawer on the right on a desktop, a
 * bottom sheet on a phone.
 *
 * Search and category chips narrow the catalogue; each item names the kind,
 * says what it shows and offers Add (or Add another when the Overview already
 * has one: the same kind may appear more than once). A desktop item also shows
 * a real Medium-size preview: the actual `Widget` drawing sample figures, made
 * inert (no focus, no clicks, hidden from assistive tech, no network).
 *
 * "Recently added" and the New tags are for a returning pilot only: on a
 * first-run layout every kind is new, so the tag would say nothing.
 */
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, Modal, SearchInput, SlideOver } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import { useOverviewEdit } from './editContext';
import { sampleView } from './gallerySamples';
import { KIND_CATEGORIES, WIDGET_KINDS, type KindCategory, type WidgetKindDef } from './kinds';
import { MAX_WIDGETS, newWidget } from './layout';
import { Widget } from './Widget';

type CategoryFilter = 'all' | 'recent' | KindCategory;

export interface GalleryProps {
  open: boolean;
  onClose: () => void;
  /** A returning pilot: Recently added and the New tags apply. */
  showNew: boolean;
}

const noop = () => undefined;

function Preview({ kind }: { kind: WidgetKindDef }) {
  const view = sampleView(kind.id);
  const widget = useMemo(() => {
    const base = newWidget(kind.id, `preview-${kind.id}`);
    if (!base) return null;
    return {
      ...base,
      size: 'M' as const,
      view: base.view,
    };
  }, [kind]);
  if (!view || !widget) return null;
  return (
    // Inert: a picture of the widget, not one. Nothing in it takes focus or a click.
    <div aria-hidden="true" inert className="pointer-events-none mt-2 flex select-none">
      <Widget widget={widget} showNew={false} onRemove={noop} previewView={view} />
    </div>
  );
}

function GalleryItem({
  kind,
  count,
  full,
  showNew,
  preview,
  onAdd,
}: {
  kind: WidgetKindDef;
  count: number;
  full: boolean;
  showNew: boolean;
  preview: boolean;
  onAdd: (kind: string) => void;
}) {
  const { t } = useTranslation();
  const title = t(kind.titleKey);
  const soon = kind.availability === 'comingSoon';
  let action;
  if (soon) {
    action = <span className="text-xs text-text-dim">{t('overview.gallery.comingSoon')}</span>;
  } else if (full) {
    action = <span className="text-xs text-text-dim">{t('overview.gallery.limit')}</span>;
  } else {
    action = (
      <Button
        variant="primary"
        size={preview ? 'sm' : 'md'}
        aria-label={
          count > 0
            ? t('overview.gallery.addAnotherLabel', { title })
            : t('overview.gallery.addLabel', { title })
        }
        onClick={() => onAdd(kind.id)}
      >
        {count > 0 ? t('overview.gallery.addAnother') : t('overview.gallery.add')}
      </Button>
    );
  }
  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {title}
            {showNew && kind.isNew && (
              <span className="rounded-xs bg-accent px-1.5 text-[0.5625rem] font-bold tracking-widest text-accent-contrast uppercase">
                {t('overview.gallery.new')}
              </span>
            )}
          </div>
          <p className="text-xs text-text-dim">{t(kind.descKey)}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {preview && !soon && <Preview kind={kind} />}
    </li>
  );
}

function GalleryBody({
  showNew,
  isPhone,
  onAdded,
}: {
  showNew: boolean;
  isPhone: boolean;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const searchId = useId();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of edit.layout.widgets) map.set(w.kind, (map.get(w.kind) ?? 0) + 1);
    return map;
  }, [edit.layout.widgets]);
  const full = edit.layout.widgets.length >= MAX_WIDGETS;

  const needle = query.trim().toLowerCase();
  const items = WIDGET_KINDS.filter((kind) => {
    if (category === 'recent' ? !kind.isNew : category !== 'all' && kind.category !== category) {
      return false;
    }
    if (!needle) return true;
    return `${t(kind.titleKey)} ${t(kind.descKey)}`.toLowerCase().includes(needle);
  });

  const chips: { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: t('overview.gallery.categories.all') },
    ...(showNew ? [{ id: 'recent' as const, label: t('overview.gallery.categories.recent') }] : []),
    ...KIND_CATEGORIES.map((id) => ({ id, label: t(`overview.gallery.categories.${id}`) })),
  ];

  return (
    <div>
      <SearchInput
        id={searchId}
        aria-label={t('overview.gallery.search')}
        placeholder={t('overview.gallery.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div
        role="group"
        aria-label={t('overview.gallery.categoriesLabel')}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {chips.map((chip) => (
          <FilterChip
            key={chip.id}
            label={chip.label}
            selected={category === chip.id}
            onToggle={() => setCategory(chip.id)}
          />
        ))}
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-xs text-text-dim">
          {t('overview.gallery.noMatch', { query: query.trim() })}
        </p>
      ) : (
        <ul className="mt-2">
          {items.map((kind) => (
            <GalleryItem
              key={kind.id}
              kind={kind}
              count={counts.get(kind.id) ?? 0}
              full={full}
              showNew={showNew}
              preview={!isPhone}
              onAdd={(id) => {
                edit.add(id);
                onAdded();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Gallery({ open, onClose, showNew }: GalleryProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const title = t('overview.gallery.title');
  if (isPhone) {
    // The sheet covers the page, so the Undo toast and the new widget's flash would sit
    // behind it: closing on Add lets the pilot see what they added.
    return (
      <Modal open={open} onClose={onClose} title={title} placement="sheet-full">
        <GalleryBody showNew={showNew} isPhone onAdded={onClose} />
      </Modal>
    );
  }
  return (
    <SlideOver open={open} onClose={onClose} title={title} maxWidthClassName="max-w-[460px]">
      <GalleryBody showNew={showNew} isPhone={false} onAdded={() => undefined} />
    </SlideOver>
  );
}
