import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppCrashed, ErrorBoundary } from './ui/ErrorBoundary'

// Start fetching the 3D scene (three.js) right away, alongside the app, rather than after it.
void import('./app/GlobeView')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={({ id, reset }) => <AppCrashed id={id} reset={reset} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
