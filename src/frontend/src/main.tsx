import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useSheet } from './AppContext';
import { Sidebar } from './components/ui';
import { FieldMap } from './map/FieldMap';
import { Crops } from './pages/Crops';
import { Data } from './pages/DataHub';
import { Fields } from './pages/Fields';
import { Home } from './pages/Home';
import { LayerPage } from './pages/Layers';
import { AddField, History, Statistics } from './pages/Other';
import { Risks } from './pages/Risks';
import './styles/app.css';

/**
 * The app frame. data-panel says whether the desktop panel column is shown; any navigation shows it again.
 * data-panel-reveal marks the moment the panel comes back, the only time its entry is animated.
 */
function Shell({ children }: { children: ReactNode }) {
  const { panelOpen, setPanelOpen, panelReveal, endPanelReveal } = useSheet();
  const { pathname } = useLocation();
  useEffect(() => setPanelOpen(true), [pathname, setPanelOpen]);
  useEffect(() => {
    if (!panelReveal) return;
    const id = window.setTimeout(endPanelReveal, 400);
    return () => window.clearTimeout(id);
  }, [panelReveal, endPanelReveal]);
  return (
    <div className="app" data-panel={panelOpen ? 'open' : 'closed'} data-panel-reveal={panelReveal || undefined}>
      {children}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Shell>
          <a className="skip-link" href="#panel">Skip to panel</a>
          <Sidebar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/layers/:tool" element={<LayerPage />} />
            <Route path="/fields" element={<Fields />} />
            <Route path="/risks" element={<Risks />} />
            <Route path="/crops" element={<Crops />} />
            <Route path="/history" element={<History />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/data" element={<Data />} />
            <Route path="/fields/new" element={<AddField />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <FieldMap />
        </Shell>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
