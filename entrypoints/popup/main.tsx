import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
