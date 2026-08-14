import { createRoot } from 'react-dom/client';
import { setBaseUrl } from "@workspace/api-client-react";

import App from './App';

import './index.css';

// Configure API base URL for native Capacitor environment
if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) {
  const baseUrl = "https://transition-assistant-api.onrender.com";
  console.log(`[Main] Native platform detected. Setting API Base URL to: ${baseUrl}`);
  setBaseUrl(baseUrl);
}

console.log("[Main] Application entry point executing.");
createRoot(document.getElementById('root')!).render(<App />);
console.log("[Main] Render call complete.");
