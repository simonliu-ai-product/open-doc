import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { HostBridge } from './components/host-bridge';
import { LocaleProvider } from './lib/i18n';
import './styles.css';

// biome-ignore lint/style/noNonNullAssertion: #root is guaranteed by index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <LocaleProvider>
        <HostBridge />
        <App />
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
);
