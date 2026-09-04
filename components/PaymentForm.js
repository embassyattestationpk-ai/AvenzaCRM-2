'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { getCurrentUser } from '../lib/auth';

export default function PaymentForm({ initial, onSaved, onCancel }) {
  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [cases, setCases] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    Payment_Type: 'Client',
    Client_or_Vendor: '',
    Case_ID: '',
    Date: new Date().toISOString().slice(0, 10),
    Total_Amount: 0,
    Paid_Amount: 0,
    Payment_Method: 'Cash',
    Notes: '',
    ...initial,
  });

  const [paymentMethods, setPaymentMethods] = useState(['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other']);

  useEffect(() => {
    Promise.all([api.getClients(), api.getVendors(), api.getCases({ pageSize: 500 }), api.getBoardTypes()]).then(([c, v, cs, opts]) => {
      setClients(c); setVendors(v); setCases(cs.rows || []);
      if (opts?.paymentMethods?.length) setPaymentMethods(opts.paymentMethods);
    }).catch(() => {});
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const names = form.Payment_Type === 'Client' ? clients.map((c) => c.Client_Name) : vendors.map((v) => v.Vendor_Name);
  const remaining = Math.max((Number(form.Total_Amount) || 0) - (Number(form.Paid_Amount) || 0), 0);

  async function submit(e) {
    e.preventDefault();
    if (!form.Client_or_Vendor) return toast.error('Select a client or vendor');
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, Added_By: initial?.Added_By || user?.fullName || '' };
      if (initial?.Payment_ID) { await api.updatePayment(payload); toast.success('Payment updated'); }
      else { await api.addPayment(payload); toast.success('Payment recorded'); }
      onSaved && onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Payment Type</label>
          <select className="input" value={form.Payment_Type} onChange={(e) => set('Payment_Type', e.target.value)}>
            <option>Client</option><option>Vendor</option>
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={form.Date} onChange={(e) => set('Date', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">{form.Payment_Type === 'Client' ? 'Client' : 'Vendor'}</label>
        <input list="names-list" className="input" value={form.Client_or_Vendor} onChange={(e) => set('Client_or_Vendor', e.target.value)} required />
        <datalist id="names-list">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
      <div>
        <label className="label">Linked Case (optional)</label>
        <select className="input" value={form.Case_ID} onChange={(e) => set('Case_ID', e.target.value)}>
          <option value="">None</option>
          {cases.map((c) => <option key={c.Case_ID} value={c.Case_ID}>{c.Case_ID} — {c.Client_Name} — {c.Service}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Total Amount</label>
          <input type="number" className="input" value={form.Total_Amount} onChange={(e) => set('Total_Amount', e.target.value)} />
        </div>
        <div>
          <label className="label">Paid Amount</label>
          <input type="number" className="input" value={form.Paid_Amount} onChange={(e) => set('Paid_Amount', e.target.value)} />
        </div>
      </div>
      <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-2.5 flex items-center justify-between text-sm">
        <span className="text-slate-500">Remaining</span>
        <span className="font-semibold">{remaining.toLocaleString()}</span>
      </div>
      <div>
        <label className="label">Payment Method</label>
        <select className="input" value={form.Payment_Method} onChange={(e) => set('Payment_Method', e.target.value)}>
          {paymentMethods.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={form.Notes} onChange={(e) => set('Notes', e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : initial?.Payment_ID ? 'Update Payment' : 'Save Payment'}</button>
      </div>
    </form>
  );
}
