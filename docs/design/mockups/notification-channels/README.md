# Notification channels (issue #5330)

First draft mockup; sample data. The ticket's text wins over the picture where they differ.

Stories: `mockups-notificationchannels--*` in `src/mockups/NotificationChannels.stories.tsx`.

| View | Image |
|---|---|
| Today: Device not granted, column still live, no icon on mail, nearby, attacks | [today-1440](today-1440.png) |
| Proposed: permission never granted. Device column greyed, red slashed icon | [proposed-device-not-granted-1440](proposed-device-not-granted-1440.png) |
| Proposed: Device toggle off, permission granted | [proposed-device-toggle-off-1440](proposed-device-toggle-off-1440.png) |
| Proposed: Alerts list off. Alerts column greyed | [proposed-alerts-off-1440](proposed-alerts-off-1440.png) |
| Proposed: opened event, D and A greyed, ticks kept | [proposed-opened-event-1440](proposed-opened-event-1440.png) |
| Phone: permission never granted | [proposed-device-not-granted-phone-390](proposed-device-not-granted-phone-390.png) |
| Phone: opened event | [proposed-opened-event-phone-390](proposed-opened-event-phone-390.png) |

New component: `MissingGrantBadge`, the Broadcast icon in `danger` with a slash. Greyed boxes are the existing disabled `Checkbox` with a tooltip that says why.
