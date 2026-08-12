import { createRoot } from 'react-dom/client';
import { setBaseUrl } from "@workspace/api-client-react";

import App from './App';

import './index.css';

// Configure API base URL for native Capacitor environment
if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) {
  setBaseUrl("http://10.32.1.27:8080");
}

createRoot(document.getElementById('root')!).render(<App />);
