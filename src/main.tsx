import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerSW } from './pwa/registerSW';
import './styles/global.css';

registerSW();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
