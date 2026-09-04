'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function VendorForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({ Vendor_Name: '', Phone: '', Email: '', Service_Type: '', Status: 'Active', Notes: '', ...initial });
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.Vendor_Name) return toast.error('Vendor name is required');
    setSaving(true);
    try {
      if (initial?.Vendor_ID) { await api.updateVendor(form); toast.success('Vendor updated'); }
      else { await api.addVendor(form); toast.success('Vendor added'); }
      onSaved && onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Vendor Name</label>
        <input className="input" value={form.Vendor_Name} onChange={(e) => set('Vendor_Name', e.target.value)} required />
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
      <div>
        <label className="label">Service Type</label>
        <input className="input" value={form.Service_Type} onChange={(e) => set('Service_Type', e.target.value)} placeholder="e.g. Embassy Attestation" />
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={form.Status} onChange={(e) => set('Status', e.target.value)}>
          <option>Active</option><option>Inactive</option>
        </select>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={form.Notes} onChange={(e) => set('Notes', e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : initial?.Vendor_ID ? 'Update Vendor' : 'Save Vendor'}</button>
      </div>
    </form>
  );
}
