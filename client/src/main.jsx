import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (no Google Fonts request): Space Grotesk for headings & numbers, Inter for reading text
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
