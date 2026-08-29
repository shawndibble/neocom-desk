import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  return (
    <main className="min-h-screen bg-bg text-text p-4">
      <h1 className="text-xl">{t('app.name')}</h1>
    </main>
  );
}
