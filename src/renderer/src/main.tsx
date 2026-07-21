import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './app/App'
import { AppStateProvider } from './app/AppState'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </HashRouter>
  </React.StrictMode>
)
