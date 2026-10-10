import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AuthGate from './AuthGate.tsx';
import { WorkspaceMotion } from './WorkspaceMotion';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceMotion>
    <BrowserRouter>
      <AuthGate />
    </BrowserRouter>
    </WorkspaceMotion>
  </React.StrictMode>
);
