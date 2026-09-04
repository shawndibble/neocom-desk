import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import { SHARED_NOTIFICATION_WORDING } from '@/engine/notificationWording';

/**
 * `SHARED_NOTIFICATION_WORDING` is also read by `src/engine/projection.ts`
 * for Scheduled Push rows, which have no i18next runtime to render from
 * (ADR 0010) — it is the one place these six events' English wording lives,
 * spliced in here so `notifications.fired.*` no longer hand-duplicates it.
 */
const translation = {
  ...en,
  notifications: {
    ...en.notifications,
    fired: {
      ...en.notifications.fired,
      ...SHARED_NOTIFICATION_WORDING,
    },
  },
};

i18n.use(initReactI18next).init({
  resources: { en: { translation } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
