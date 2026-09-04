'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import QuickAddModal from './QuickAddModal';
import { getCurrentUser } from '../lib/auth';

export default function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState(null);
  const [ready, setReady] = useState(false);

  const isPublic = pathname.startsWith('/status');
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (isPublic || isLogin) { setReady(true); return; }
    const user = getCurrentUser();
    if (!user) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [pathname]);

  // Public QR-scan status pages and the login page render on their own,
  // with no sidebar/topbar/auth requirement.
  if (isPublic || isLogin) {
    return (
      <>
        <Toaster position="top-right" />
        {children}
      </>
    );
  }

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Toaster position="top-right" />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onQuickAdd={setQuickAdd} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      {quickAdd && <QuickAddModal type={quickAdd} onClose={() => setQuickAdd(null)} />}
    </div>
  );
}
