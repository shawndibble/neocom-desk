import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  InfoTooltip,
  IskAmount,
  MenuItem,
  Modal,
  Panel,
  RowActionsMenu,
  RowCaret,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  textActionClassName,
  useOpenAfterMenu,
} from '@/components/ui';
import { ExternalLink, ExternalMark } from '@/components/ui/ExternalLink';
import { HintText } from '@/components/ui/HintText';
import {
  focusRingClassName,
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { CharacterLink, SkillLink, SystemLink } from '@/features/entities';
import { MyOrderMark } from '@/features/market/marketOrderCells';
import { cx } from '@/lib/cx';

const SAMPLE_ROWS = [
  { id: 1, name: 'Rifter' },
  { id: 2, name: 'Slasher' },
  { id: 3, name: 'Merlin' },
];

/** One cue: its DESIGN.md §6c rule name above, the real component below. */
function Cue({ rule, note, children }: { rule: string; note?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-xs border border-line bg-panel p-3">
      <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {rule}
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">{children}</div>
      {note && <p className="text-xs text-text-dim">{note}</p>}
    </div>
  );
}

/** A menu item that opens a dialog, opened only once the menu has closed (`useOpenAfterMenu`). */
function MenuOpensDialogSample({ k }: { k: (key: string) => string }) {
  const [open, setOpen] = useState(false);
  const afterMenu = useOpenAfterMenu();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
            label={k('samples.menuDialogTrigger')}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={afterMenu.onCloseAutoFocus}>
          <DropdownMenuItem onSelect={() => afterMenu.run(() => setOpen(true))}>
            {k('samples.menuDialogItem')}
          </DropdownMenuItem>
          <DropdownMenuItem>{k('samples.menuItemDuplicate')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Modal open={open} onClose={() => setOpen(false)} title={k('samples.menuDialogTitle')}>
        <p className="text-sm">{k('samples.menuDialogBody')}</p>
      </Modal>
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-text">{title}</h3>
      <div className="grid gap-2 md:grid-cols-2">{children}</div>
    </div>
  );
}

/**
 * Every row of DESIGN.md §6c's cue vocabulary and the shared states, built from
 * the real primitives so drift shows up beside its rule. Needs a Router
 * (entity links). Hover, pressed and focus can't be forced on real components:
 * the labels say how to trigger each one.
 */
export function InteractionGrammar() {
  const { t } = useTranslation();
  const k = (key: string) => t(`styleguide.interactionGrammar.${key}`);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<number | null>(2);

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-dim">{k('intro')}</p>

      <Group title={k('groups.links')}>
        <Cue rule={k('rules.accentText')}>
          <CharacterLink id={90_000_001}>{k('samples.character')}</CharacterLink>
          <SkillLink typeId={3300}>{k('samples.skill')}</SkillLink>
          <SystemLink systemId={30_000_142}>Jita</SystemLink>
        </Cue>
        <Cue rule={k('rules.inlineLink')}>
          <span>
            {k('samples.sentenceBefore')}{' '}
            <a href="#" className={inlineLinkClassName}>
              {k('samples.inlineLink')}
            </a>{' '}
            {k('samples.sentenceAfter')}
          </span>
        </Cue>
        <Cue rule={k('rules.textAction')} note={k('notes.textAction')}>
          <button type="button" className={textActionClassName()}>
            {k('samples.textAction')}
          </button>
        </Cue>
        <Cue rule={k('rules.externalLink')}>
          <ExternalLink href="https://zkillboard.com">zKillboard</ExternalLink>
          <ExternalLink href="https://evewho.com" variant="quiet">
            EveWho
          </ExternalLink>
          <Button>
            {k('samples.addToCalendar')}
            <ExternalMark />
          </Button>
        </Cue>
      </Group>

      <Group title={k('groups.explain')}>
        <Cue rule={k('rules.hintText')}>
          <HintText content={k('samples.hintContent')}>{k('samples.hintText')}</HintText>
        </Cue>
        <Cue rule={k('rules.infoTooltip')}>
          <span>{k('samples.term')}</span>
          <InfoTooltip label={k('samples.infoLabel')} content={k('samples.infoContent')} />
        </Cue>
        <Cue rule={k('rules.infoButton')}>
          <IconButton icon={<Icon.Info />} label={k('samples.showInfo')} />
        </Cue>
        <Cue rule={k('rules.pencil')}>
          <span className="inline-flex items-center gap-1">
            {k('samples.editableValue')}
            <Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" aria-hidden="true" />
          </span>
        </Cue>
        <Cue rule={k('rules.assumed')}>
          <span className="flex items-center gap-1 text-xs text-warning">
            <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {k('samples.assumedFee')}
          </span>
          <button type="button" className={textActionClassName()}>
            {t('market.structureFee.setFee')}
          </button>
        </Cue>
        <Cue rule={k('rules.myOrder')}>
          <span className="tabular-nums">
            <MyOrderMark t={t} />
            {k('samples.myOrder')}
          </span>
        </Cue>
        <Cue rule={k('rules.iskAmount')} note={k('notes.iskAmount')}>
          <IskAmount value={1_342_500_000} />
          <IskAmount value={48_250} />
        </Cue>
      </Group>

      <Group title={k('groups.carets')}>
        <Cue rule={k('rules.rowCaret')}>
          <a
            href="#"
            className={cx(
              'group flex w-full items-center justify-between rounded-xs px-2 py-2 ',
              focusRingInsetClassName,
              rowInteractiveClassName
            )}
          >
            <span>{k('samples.rowLink')}</span>
            <RowCaret />
          </a>
        </Cue>
        <Cue rule={k('rules.disclosureCaret')}>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className={cx(
              'flex items-center gap-1.5 rounded-xs text-xs font-semibold text-text-dim uppercase',
              focusRingClassName
            )}
          >
            <Caret expanded={expanded} />
            {k('samples.disclosure')}
          </button>
        </Cue>
        <Cue rule={k('rules.fieldCaret')} note={k('notes.fieldCaret')}>
          <Select defaultValue="forge">
            <SelectTrigger aria-label={k('samples.region')} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="forge">The Forge</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
            </SelectContent>
          </Select>
        </Cue>
        <Cue rule={k('rules.pending')}>
          <span className="inline-flex items-center gap-1.5">
            <Icon.Pending size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            {k('samples.pending')}
          </span>
        </Cue>
        <Cue rule={k('rules.pagerCarets')}>
          <IconButton icon={<Icon.Back />} label={k('samples.previous')} />
          <IconButton icon={<Icon.Descend />} label={k('samples.next')} />
        </Cue>
        <Cue rule={k('rules.dialogOpener')} note={k('notes.dialogOpener')}>
          <Button>{k('samples.renameDialog')}</Button>
          <Button>{k('samples.showWindow')}</Button>
        </Cue>
      </Group>

      <Group title={k('groups.menusRows')}>
        <Cue rule={k('rules.rowMenu')} note={k('notes.rowMenu')}>
          <div className="w-full">
            <DataTable
              label={k('samples.tableLabel')}
              columns={[
                {
                  id: 'name',
                  header: k('samples.nameHeader'),
                  primary: true,
                  render: (row: (typeof SAMPLE_ROWS)[number]) => row.name,
                },
              ]}
              rows={SAMPLE_ROWS}
              rowKey={(row) => row.id}
              rowMoreActions
              rowContextMenu={(row, tr) => (
                <RowActionsMenu
                  name={row.name}
                  items={
                    <>
                      <MenuItem>{k('samples.menuItem')}</MenuItem>
                      <MenuItem>{k('samples.menuItemDuplicate')}</MenuItem>
                    </>
                  }
                >
                  {tr}
                </RowActionsMenu>
              )}
            />
          </div>
        </Cue>
        <Cue rule={k('rules.menuOpensDialog')} note={k('notes.menuOpensDialog')}>
          <MenuOpensDialogSample k={k} />
        </Cue>
        <Cue rule={k('rules.selectedRow')} note={k('notes.selectedRow')}>
          <div className="w-full">
            <DataTable
              label={k('samples.selectableLabel')}
              columns={[
                {
                  id: 'name',
                  header: k('samples.nameHeader'),
                  primary: true,
                  render: (row: (typeof SAMPLE_ROWS)[number]) => row.name,
                },
              ]}
              rows={SAMPLE_ROWS}
              rowKey={(row) => row.id}
              selectedRowKey={selected}
              onRowClick={(row) => setSelected(row.id)}
            />
          </div>
        </Cue>
      </Group>

      <Panel>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-text">{k('groups.states')}</h3>
          <p className="text-xs text-text-dim">{k('notes.states')}</p>
          <div className="grid gap-2 md:grid-cols-2">
            <Cue rule={k('rules.stateRest')}>
              <Button>{k('samples.ghost')}</Button>
              <Button variant="primary">{k('samples.primary')}</Button>
              <Button variant="danger">{k('samples.danger')}</Button>
            </Cue>
            <Cue rule={k('rules.stateHoverPressed')} note={k('notes.hoverPressed')}>
              <Button>{k('samples.ghost')}</Button>
              <IconButton icon={<Icon.Info />} label={k('samples.showInfo')} />
            </Cue>
            <Cue rule={k('rules.stateFocus')} note={k('notes.focus')}>
              <Button>{k('samples.boxed')}</Button>
              <a href="#" className={inlineLinkClassName}>
                {k('samples.inlineLink')}
              </a>
            </Cue>
            <Cue rule={k('rules.stateDisabled')} note={k('notes.disabled')}>
              <Button disabled>{k('samples.disabled')}</Button>
              <Button aria-disabled="true">{k('samples.ariaDisabled')}</Button>
            </Cue>
            <Cue rule={k('rules.stateLoading')}>
              <Button loading>{k('samples.saving')}</Button>
              <Button variant="primary" loading>
                {k('samples.saving')}
              </Button>
            </Cue>
            <Cue rule={k('rules.stateSelected')} note={k('notes.selectedToggle')}>
              <IconButton icon={<Icon.Info />} label={k('samples.toggleOn')} pressed />
              <IconButton icon={<Icon.Info />} label={k('samples.toggleOff')} pressed={false} />
            </Cue>
          </div>
        </div>
      </Panel>
    </div>
  );
}
