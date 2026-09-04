'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { money, fmtDate } from '../../lib/utils';
import Modal, { ConfirmModal } from '../../components/Modal';
import PaymentForm from '../../components/PaymentForm';

function statusOf(p) {
  const remaining = Number(p.Remaining_Amount) || 0;
  const total = Number(p.Total_Amount) || 0;
  if (remaining <= 0 && total > 0) return 'Paid';
  if (remaining > 0 && remaining < total) return 'Partial';
  return 'Unpaid';
}
const STATUS_STYLE = { Paid: 'bg-emerald-100 text-emerald-700', Partial: 'bg-amber-100 text-amber-700', Unpaid: 'bg-red-100 text-red-700' };

export default function PaymentsPage() {
  const [tab, setTab] = useState('Client');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function load() {
    setLoading(true);
    api.getPayments({ type: tab }).then(setRows).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, [tab]);

  async function doDelete() {
    try { await api.deletePayment(deleting.Payment_ID); toast.success('Payment deleted'); setDeleting(null); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Payments</h1>
          <p className="text-sm text-slate-500">Track client & vendor payments</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>➕ Add Payment</button>
      </div>

      <div className="flex gap-2">
        {['Client', 'Vendor'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {t} Payments
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {[tab, 'Case', 'Total', 'Paid', 'Remaining', 'Date', 'Method', 'Status', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="td text-center text-slate-400 py-8">Loading…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={9} className="td text-center text-slate-400 py-8">No {tab.toLowerCase()} payments yet</td></tr>}
            {rows.map((p) => (
              <tr key={p.Payment_ID} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="td font-medium">{p.Client_or_Vendor}</td>
                <td className="td font-mono text-xs">{p.Case_ID || '-'}</td>
                <td className="td">{money(p.Total_Amount)}</td>
                <td className="td text-emerald-600">{money(p.Paid_Amount)}</td>
                <td className="td text-red-600">{money(p.Remaining_Amount)}</td>
                <td className="td">{fmtDate(p.Date)}</td>
                <td className="td">{p.Payment_Method}</td>
                <td className="td"><span className={`badge ${STATUS_STYLE[statusOf(p)]}`}>{statusOf(p)}</span></td>
                <td className="td">
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => setEditing(p)}>Edit</button>
                    <button className="btn-danger" onClick={() => setDeleting(p)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add Payment' : 'Edit Payment'} onClose={() => setEditing(null)}>
          <PaymentForm initial={editing === 'new' ? { Payment_Type: tab } : editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {deleting && <ConfirmModal message={`Delete this payment record for ${deleting.Client_or_Vendor}?`} onCancel={() => setDeleting(null)} onConfirm={doDelete} />}
    </div>
  );
}
