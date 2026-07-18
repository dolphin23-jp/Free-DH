import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initializeBrowserPersistence } from './store/persistence'
import { App } from './ui/App'
import './ui/styles.css'
import './ui/battle.css'
import './ui/drop.css'
import './ui/shop.css'
import './ui/codex.css'
import './ui/reward.css'
import './ui/fusion.css'
import './ui/meta.css'

initializeBrowserPersistence()

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
