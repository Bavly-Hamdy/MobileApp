
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize the app with proper React 18 createRoot API
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
