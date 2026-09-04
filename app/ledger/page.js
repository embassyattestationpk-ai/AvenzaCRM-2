'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { money } from '../../lib/utils';
import StatCard from '../../components/StatCard';

const TABS = [
  { key: 'clients', label: 'Clients (Walk-in)' },
  { key: 'consultants', label: 'Consultants' },
  { key: 'vendors', label: 'Vendors' },
];

export default function LedgerPage() {
  const [ledger, setLedger] = useState(null);
  const [tab, setTab] = useState('clients');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.getLedger().then(setLedger).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const rows = ledger ? ledger[tab] : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Ledger</h1>
        <p className="text-sm text-slate-500">Who owes what — clients, consultants and vendors</p>
      </div>

      {ledger && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Receivable from Clients" value={money(ledger.totals.receivableFromClients)} icon="💵" tone="brand" />
          <StatCard label="Receivable from Consultants" value={money(ledger.totals.receivableFromConsultants)} icon="🤝" tone="purple" />
          <StatCard label="Payable to Vendors" value={money(ledger.totals.payableToVendors)} icon="🏢" tone="red" />
        </div>
      )}

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {tab === 'vendors'
              ? ['Vendor', 'Cases', 'Total Payable', 'Total Paid', 'Balance (We Owe)'].map((h) => <th key={h} className="th">{h}</th>)
              : ['Name', 'Cases', 'Total Billed', 'Total Paid', 'Balance (Owed to Us)'].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="td text-center text-slate-400 py-8">Loading…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={5} className="td text-center text-slate-400 py-8">No records</td></tr>}
            {tab === 'vendors' ? rows.map((r) => (
              <tr key={r.name} className="border-b border-slate-50">
                <td className="td font-medium">{r.name}</td>
                <td className="td">{r.caseCount}</td>
                <td className="td">{money(r.totalPayable)}</td>
                <td className="td">{money(r.totalPaid)}</td>
                <td className={`td font-semibold ${r.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(r.balance)}</td>
              </tr>
            )) : rows.map((r) => (
              <tr key={r.name} className="border-b border-slate-50">
                <td className="td font-medium">{r.name}</td>
                <td className="td">{r.caseCount}</td>
                <td className="td">{money(r.totalBilled)}</td>
                <td className="td">{money(r.totalPaid)}</td>
                <td className={`td font-semibold ${r.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
