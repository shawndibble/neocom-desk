/**
 * Settings > Notifications' Topics: every Notification Event once, filed under
 * seven Topics (`topics.ts`), each row speaking for all Characters (see
 * `AggregateRow`). Corp keeps its shared best-effort note and one permission
 * line, and EVE notifications close the list.
 *
 * Desktop: tabs across the top, each with its event count, one table per
 * Topic. Phone: a list of Topics, each with a one-line state, drilling into
 * the Topic (the `topic` URL param, so Back returns to the list). A search
 * shows the matches of every Topic in one stack instead.
 */
import { Tabs, TabPanel, useTabsId } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import * as Icon from '@/components/ui/icons';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { enumParam } from '@/lib/urlState';
import { useUrlParam } from '@/lib/useUrlState';
import { useTranslation } from 'react-i18next';
import { ChannelColumnHeadings } from './ChannelColumns';
import { NotificationEventRow } from './NotificationEventRow';
import { PermissionNote } from './PermissionNote';
import { EMPTY_SCOPES, missingPermissionSummary, type EventRowContext } from './eventRowSupport';
import { eventApplicability } from './eventApplicability';
import { EveNotificationRow } from './EveNotificationRow';
import type { NotificationEventId } from './events';
import { isEventEnabledFor } from './eventSelection';
import { characterEventPrefs } from './preferences';
import { notificationTopics, summarizeTopic, TOPIC_IDS, type Topic } from './topics';

/** Module scope so `useUrlParam` sees a stable codec identity across renders. */
const TOPIC_PARAM = enumParam(['', ...TOPIC_IDS] as const, '');

export function NotificationEventList({
  eventIds,
  context,
  extraTypesByCharacter,
  searching = false,
}: {
  eventIds: readonly NotificationEventId[];
  context: EventRowContext;
  extraTypesByCharacter: ReadonlyMap<number, readonly string[]>;
  /** A search is active: show every matching Topic in one stack, not one at a time. */
  searching?: boolean;
}) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [topicParam, setTopicParam] = useUrlParam('topic', TOPIC_PARAM);
  const topics = notificationTopics(eventIds);
  const topicLabel = (topic: Topic) => t(`settings.notifications.group.${topic.id}`);

  const table = (topic: Topic) => (
    <TopicTable
      topic={topic}
      context={context}
      extraTypesByCharacter={extraTypesByCharacter}
      showEveTypes={!searching}
    />
  );

  if (searching) {
    return (
      <div className="space-y-3">
        {topics.map((topic) => (
          <section key={topic.id} aria-label={topicLabel(topic)}>
            <h3 className={cx(eyebrowClassName, 'px-1 pb-1')}>{topicLabel(topic)}</h3>
            {table(topic)}
          </section>
        ))}
      </div>
    );
  }

  const selected = topics.find((topic) => topic.id === topicParam) ?? null;

  if (context.isDesktop) {
    const current = selected ?? topics[0];
    if (current === undefined) return null;
    return (
      <div>
        <Tabs
          tabsId={tabsId}
          label={t('settings.notifications.topicsLabel')}
          tabs={topics.map((topic) => ({
            id: topic.id,
            label: topicLabel(topic),
            count: topic.eventIds.length,
          }))}
          value={current.id}
          onChange={(id) => setTopicParam(id as Topic['id'])}
        />
        <TabPanel tabsId={tabsId} tabId={current.id} className="mt-2">
          {table(current)}
        </TabPanel>
      </div>
    );
  }

  if (selected !== null) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setTopicParam('')}
          className={cx(
            'flex min-h-9 items-center gap-1.5 text-xs text-text-dim',
            interactiveClassName,
            focusRingInsetClassName
          )}
        >
          <Icon.Back size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t('settings.notifications.backToTopics')}
        </button>
        <h3 className="text-sm font-medium text-text">{topicLabel(selected)}</h3>
        {table(selected)}
      </div>
    );
  }

  return (
    <ul
      aria-label={t('settings.notifications.topicsLabel')}
      className="divide-y divide-line rounded-xs border border-line bg-panel/85"
    >
      {topics.map((topic) => (
        <li key={topic.id}>
          <button
            type="button"
            onClick={() => setTopicParam(topic.id, { push: true })}
            className={cx(
              'flex min-h-9 w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-panel-2',
              interactiveClassName,
              focusRingInsetClassName
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-text">{topicLabel(topic)}</span>
              <span className="block text-[0.6875rem] text-text-dim">
                <TopicStateLine topic={topic} context={context} />
              </span>
            </span>
            <Icon.GoTo size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-dim" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Whether one Character can use one event: scope and corp role, as the row says. */
function canUse(context: EventRowContext, eventId: NotificationEventId, characterId: number) {
  return eventApplicability(
    eventId,
    context.scopesByCharacterId.get(characterId) ?? EMPTY_SCOPES,
    context.capabilitiesByCharacterId.get(characterId)
  ).rowEnabled;
}

/** "Device 3 · Alerts 3 of 3", or for Corp with nobody able to use it, why. */
function TopicStateLine({ topic, context }: { topic: Topic; context: EventRowContext }) {
  const { t } = useTranslation();
  const summary = summarizeTopic(
    topic.eventIds,
    context.characters.map((character) => character.characterId),
    (eventId, characterId) => canUse(context, eventId, characterId),
    (eventId, characterId, channel) =>
      isEventEnabledFor(characterEventPrefs(context.prefsValue, characterId), eventId, channel)
  );
  if (!summary.usable && topic.id === 'corp') {
    return <>{t('settings.notifications.topicNeedsCorpPermission')}</>;
  }
  return (
    <>
      {t('settings.notifications.topicState', {
        device: summary.device,
        alerts: summary.alerts,
        total: summary.total,
      })}
    </>
  );
}

function TopicTable({
  topic,
  context,
  extraTypesByCharacter,
  showEveTypes,
}: {
  topic: Topic;
  context: EventRowContext;
  extraTypesByCharacter: ReadonlyMap<number, readonly string[]>;
  showEveTypes: boolean;
}) {
  const { t } = useTranslation();
  // Every corp event rides the one opt-in Corporation Permission, so the Topic says it once.
  const corpMissing =
    topic.id === 'corp' ? missingPermissionSummary(topic.eventIds, context) : null;
  // When nobody can use any corp event, that one line says it; rows don't repeat "None can use this".
  const nobodyCanUse =
    topic.id === 'corp' &&
    !topic.eventIds.some((eventId) =>
      context.characters.some((character) => canUse(context, eventId, character.characterId))
    );
  return (
    <div className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      <ChannelColumnHeadings pinned channelOff={context.channelOff} />
      {topic.id === 'corp' && (
        <div className="space-y-1 border-b border-line bg-panel/60 px-3 py-1.5 text-[0.6875rem] text-text-dim">
          <p>{t('settings.notifications.corpEventBestEffortHint')}</p>
          {nobodyCanUse && <p>{t('settings.notifications.topicNeedsCorpPermission')}</p>}
          {corpMissing !== null && <PermissionNote {...corpMissing} />}
        </div>
      )}
      <ul className="divide-y divide-line">
        {topic.id === 'eve' ? (
          <EveNotificationRow
            context={context}
            extraTypesByCharacter={extraTypesByCharacter}
            showTypes={showEveTypes}
          />
        ) : (
          topic.eventIds.map((eventId) => (
            <NotificationEventRow
              key={eventId}
              eventId={eventId}
              context={context}
              omitUnavailableNote={nobodyCanUse}
            />
          ))
        )}
      </ul>
    </div>
  );
}
