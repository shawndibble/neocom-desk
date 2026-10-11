import type { Preview } from '@storybook/react-vite';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import '@/styles/index.css';

// The app is dark-only (docs/DESIGN.md), so the backdrop is the page `bg` token
// and there is no theme switch to wire up.
const preview: Preview = {
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    controls: { matchers: { date: /Date$/i } },
  },
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <div className="min-h-screen bg-bg p-4 text-text">
            <Story />
          </div>
        </MemoryRouter>
      </I18nextProvider>
    ),
  ],
};

export default preview;
