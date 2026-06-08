import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/sansation/300.css';
import '@fontsource/sansation/400.css';
import '@fontsource/sansation/700.css';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { setGlobalTheme } from '@atlaskit/tokens';
import App from './App';
import './styles.css';
import './reader/reader.css';
import './admin/admin-polish.css';

// ADS token foundation (Phase 1): mounts the --ds-* custom properties
// globally. Surfaces consume them via var(--ds-*, fallback) so the app
// still renders with the legacy palette if theme CSS fails to load.
void setGlobalTheme({ colorMode: 'light', light: 'light', dark: 'dark', spacing: 'spacing', typography: 'typography', shape: 'shape' });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
