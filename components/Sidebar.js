'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/clients', label: 'Clients', icon: '👥' },
  { href: '/cases', label: 'Cases / Documents', icon: '📁' },
  { href: '/add', label: 'Add New Entry', icon: '➕' },
  { href: '/vendors', label: 'Vendors', icon: '🏢' },
  { href: '/payments', label: 'Payments', icon: '💰' },
  { href: '/ledger', label: 'Ledger', icon: '📒' },
  { href: '/reports', label: 'Reports', icon: '📊' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 bg-slate-900 text-slate-200 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Avenza Consultancy" className="h-9 w-auto object-contain" />
        <div>
          <div className="text-sm font-bold text-white leading-tight">Avenza Consultancy</div>
          <div className="text-xs text-slate-400 leading-tight">CRM</div>
        </div>
      </div>
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                active ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-xs text-slate-500 border-t border-slate-800">
        Backend: Google Sheets
      </div>
    </aside>
  );
}
