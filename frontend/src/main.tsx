import { I18nProvider } from '@/i18n/context';
import { appTheme } from '@/theme';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';


import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark" forceColorScheme="dark">
      <Notifications position="top-right" />
      <I18nProvider>
        <App />
      </I18nProvider>
    </MantineProvider>
  </StrictMode>,
);
