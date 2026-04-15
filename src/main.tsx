import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LayoutProvider } from './contexts/layout-context.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LayoutProvider>
      <App />
    </LayoutProvider>
  </StrictMode>,
)
