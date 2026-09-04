'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { getCurrentUser, logout } from '../lib/auth';

export default function Topbar({ onQuickAdd }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [user, setUser] = useState(null);
  const boxRef = useRef(null);
  const router = useRouter();

  useEffect(() => { setUser(getCurrentUser()); }, []);

  function doLogout() {
    logout();
    router.push('/login');
  }

  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.globalSearch(q.trim());
        setResults(r);
        setOpen(true);
      } catch (e) { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <header className="h-16 shrink-0 bg-white border-b border-slate-200 flex items-center gap-4 px-6">
      <div className="relative flex-1 max-w-lg" ref={boxRef}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Search clients, cases, vendors, phone, status…"
          className="input pl-9"
        />
        <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>

        {open && results && (
          <div className="absolute z-30 mt-2 w-full bg-white rounded-xl shadow-lg border border-slate-100 max-h-96 overflow-y-auto">
            <ResultGroup title="Clients" items={results.clients} onPick={(c) => { router.push(`/clients/${c.Client_ID}`); setOpen(false); setQ(''); }} render={(c) => `${c.Client_Name} — ${c.Phone || 'no phone'}`} />
            <ResultGroup title="Cases" items={results.cases} onPick={() => { router.push('/cases'); setOpen(false); setQ(''); }} render={(c) => `${c.Case_ID} — ${c.Client_Name} (${c.Document_Status})`} />
            <ResultGroup title="Vendors" items={results.vendors} onPick={(v) => { router.push(`/vendors/${v.Vendor_ID}`); setOpen(false); setQ(''); }} render={(v) => `${v.Vendor_Name} — ${v.Service_Type || ''}`} />
            {!results.clients.length && !results.cases.length && !results.vendors.length && (
              <div className="p-3 text-sm text-slate-400">No matches</div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="relative">
        <button className="btn-primary" onClick={() => setAddOpen((v) => !v)}>➕ Quick Add</button>
        {addOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-30">
            {[
              ['client', 'New Client'],
              ['case', 'New Case'],
              ['payment', 'New Payment'],
              ['vendor', 'New Vendor'],
            ].map(([type, label]) => (
              <button
                key={type}
                onClick={() => { onQuickAdd(type); setAddOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="btn-ghost" title="Notifications">🔔</button>

      <div className="relative">
        <button onClick={() => setUserOpen((v) => !v)} className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold">
            {(user?.fullName || '?').charAt(0)}
          </div>
        </button>
        {userOpen && (
          <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-30">
            <div className="px-4 py-1.5">
              <div className="text-sm font-semibold text-slate-800">{user?.fullName || 'Guest'}</div>
              <div className="text-xs text-slate-400 capitalize">{user?.role || ''}</div>
            </div>
            <div className="border-t border-slate-100 my-1" />
            <button onClick={doLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50">Logout</button>
          </div>
        )}
      </div>
    </header>
  );
}

function ResultGroup({ title, items, onPick, render }) {
  if (!items || !items.length) return null;
  return (
    <div className="border-b border-slate-50 last:border-0">
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase">{title}</div>
      {items.map((it, i) => (
        <button key={i} onClick={() => onPick(it)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
          {render(it)}
        </button>
      ))}
    </div>
  );
}
