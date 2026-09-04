'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { getCurrentUser } from '../lib/auth';

export default function ClientForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({ Client_Name: '', Phone: '', Email: '', Company: '', Address: '', Notes: '', Status: 'Active', Client_Type: 'Walk-in', ID_Card_Number: '', ...initial });
  const [saving, setSaving] = useState(false);
  const isConsultant = form.Client_Type === 'Consultant';
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.Client_Name) return toast.error('Client name is required');
    setSaving(true);
    try {
      if (initial?.Client_ID) {
        await api.updateClient(form);
        toast.success('Client updated');
      } else {
        const user = getCurrentUser();
        await api.addClient({ ...form, Added_By: user?.fullName || '' });
        toast.success('Client added');
      }
      onSaved && onSaved();
    } catch (e) {
      if (String(e.message).startsWith('DUPLICATE')) {
        toast.error('A client with this name/phone already exists');
      } else toast.error(e.message);
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Client Name</label>
        <input className="input" value={form.Client_Name} onChange={(e) => set('Client_Name', e.target.value)} required />
      </div>
      <div>
        <label className="label">Client Type</label>
        <select className="input" value={form.Client_Type} onChange={(e) => set('Client_Type', e.target.value)}>
          <option value="Walk-in">Walk-in</option>
          <option value="Consultant">Consultant</option>
        </select>
        <p className="text-xs text-slate-400 mt-1">Consultant = someone we take work from (as our client); Walk-in = a regular direct client.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.Phone} onChange={(e) => set('Phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={form.Email} onChange={(e) => set('Email', e.target.value)} />
        </div>
      </div>
      {isConsultant ? (
        <div>
          <label className="label">Company</label>
          <input className="input" value={form.Company} onChange={(e) => set('Company', e.target.value)} />
        </div>
      ) : (
        <div>
          <label className="label">ID Card Number (CNIC)</label>
          <input className="input" value={form.ID_Card_Number} onChange={(e) => set('ID_Card_Number', e.target.value)} placeholder="XXXXX-XXXXXXX-X" />
        </div>
      )}
      <div>
        <label className="label">Address</label>
        <input className="input" value={form.Address} onChange={(e) => set('Address', e.target.value)} />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={form.Notes} onChange={(e) => set('Notes', e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : initial?.Client_ID ? 'Update Client' : 'Save Client'}</button>
      </div>
    </form>
  );
}
