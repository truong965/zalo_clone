/**
 * Entry point - Mount React vào DOM
 */

import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import '@/lib/i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
            <Suspense fallback={null}>
                  <App />
            </Suspense>
      </React.StrictMode>,
);
