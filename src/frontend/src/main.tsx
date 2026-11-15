import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './AppContext';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <div className="app">
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
        </div>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
