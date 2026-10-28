/**
 * The shared info modal's view of an NPC faction (`?info=faction-<id>`): no
 * tabs, one view. Mounted by `PublicInfoModal`; lazy-loaded.
 */
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { useIsPhone } from '@/lib/useIsPhone';
import NpcInfoView from './NpcInfoView';
import { useFactionFacts } from './useNpcInfo';

export default function FactionModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const facts = useFactionFacts(id).data;
  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {facts?.name ?? t('publicInfo.title')}
          <Pill>{t('publicInfo.npc.kind.faction')}</Pill>
        </span>
      }
      placement={isPhone ? 'sheet-full' : 'medium'}
      closeOnBack={false}
    >
      <div className="flex flex-col gap-3">
        {facts?.description && (
          <p className="text-sm whitespace-pre-line text-text-dim">{facts.description}</p>
        )}
        <NpcInfoView kind="faction" id={id} />
      </div>
    </Modal>
  );
}
