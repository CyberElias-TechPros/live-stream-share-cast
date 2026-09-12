import { createRoot } from 'react-dom/client'
import { bootAccent } from './hooks/useAccent'
import App from './App.tsx'
import './index.css'

// Apply the persisted signature hue before first paint (no flash).
bootAccent()

createRoot(document.getElementById("root")!).render(<App />);
