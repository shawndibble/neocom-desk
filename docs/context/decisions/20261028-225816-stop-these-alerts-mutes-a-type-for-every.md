# Scope decisions — Stop these alerts mutes a type for every character on the account

_Recorded 2026-10-28._

- **"Stop these alerts", the one-tap mute in an alert row's `⋮`, turns the type
  off for every character on the account — not only the characters whose fires
  are in that group.** The mute functions are per character
  (`withEventChannelToggled(value, characterId, eventId, channel)`,
  `withEveNotificationTypeToggled`), while an `AlertTypeGroup` carries
  `characterIds`, plural, so the scope had to be chosen rather than inferred.
  Account-wide is what the words say: a pilot who stops caring about market
  order undercuts does not mean "on these two characters". It rules out the
  literal reading of the row, which would mute only the characters that
  happened to fire, and would leave the same alert reappearing from a third
  character the next day — the behaviour that made the existing four-step
  Settings detour necessary in the first place. The toast names the scope
  ("Structure fuel alerts off for all characters · Undo") so the breadth is
  visible and reversible, and the mute also clears the fires already listed
  under the same Undo. Both channels (`feed` and `browser`) go off together;
  `NOTIFICATION_CHANNELS` has no third. Per-character, per-channel and
  threshold control stays where it is, behind "Notification settings…".
  Background: `docs/design/alerts-panel-ux-research.md` §4c.
