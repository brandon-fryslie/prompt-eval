import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';
import './index.css';

const theme = createTheme({
  primaryColor: 'violet',
  fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", "Fira Code", monospace',
  defaultRadius: 'md',
  colors: {
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5c5f66',
      '#373A40',
      '#2C2E33',
      '#25262b',
      '#1A1B1E',
      '#141517',
      '#0d0e10',
    ],
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" zIndex={9999} />
      <App />
    </MantineProvider>
  </StrictMode>
);
