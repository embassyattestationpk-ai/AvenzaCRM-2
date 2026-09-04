'use client';

import { useEffect } from 'react';

// Registers the service worker so Chrome/Android treats this as an
// installable app ("Add to Home screen" / "Install app"). Silently does
// nothing if service workers aren't supported — never blocks the app.
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
