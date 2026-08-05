import { createRoot } from 'react-dom/client'
import { App } from './App'
import 'matinee/styles.css'
import './demo.css'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
