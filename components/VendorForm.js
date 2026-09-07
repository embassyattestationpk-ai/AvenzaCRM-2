'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

// PHASE 17: Add/Edit Vendor now ticks the services this vendor offers
// (reusing BOARD_TYPES — the same fixed services list CaseForm/Settings
// already use, via getBoardTypes()) instead of one free-text Service_Type
// field. Each ticked service gets its own Rate + Turnaround Time (TAT),
// saved as a vendor-level ServiceRates row (Document_Type left BLANK —
// meaning "applies to the whole service, not one specific document type";
// getServiceRates/CaseForm's per-document-type auto-suggest always filters
// by an exact documentType, so a blank row simply never matches those
// granular lookups and can't clobber them — see the vendor profile page's
// existing "any" label for a blank Document_Type, same idea).
// PHASE 18: "Rate" split into two simple numbers — First Document and
// Additional Document (a second/third copy in the same batch usually costs
// less) — plus TAT. Nothing fancier than that: the auto-suggest at intake
// still only pre-fills the First Document rate, and everything past that
// (extra copies, client slips) stays a manual staff edit, per instruction.
function emptyRow(service, isOther) {
  return { id: (isOther ? 'other_' : 'svc_') + service + '_' + Math.random().toString(36).slice(2, 8), service, isOther: !!isOther, rate: '', additionalRate: '', tat: '', rateId: null };
}

export default function VendorForm({ initial, onSaved, onCancel }) {
  const isEdit = !!initial?.Vendor_ID;
  const [form, setForm] = useState({ Vendor_Name: '', Phone: '', Email: '', Address: '', Service_Type: '', Status: 'Active', Notes: '', ...initial });
  const [saving, setSaving] = useState(false);
  const [boardTypes, setBoardTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [initialRateIds, setInitialRateIds] = useState([]); // to detect unticked rows that need deleting on save
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  useEffect(() => {
    api.getBoardTypes().then((bt) => setBoardTypes(bt.boards || [])).catch(() => {});
  }, []);

  // Editing an existing vendor: pre-populate the tick-list/rows from its
  // existing ServiceRates entries — only the vendor-level ones (blank
  // Document_Type); a granular per-document-type row from Phase 16 (Part B)
  // is left alone here, untouched by this form.
  useEffect(() => {
    if (!isEdit || !initial?.Vendor_Name) return;
    api.getServiceRates({ vendor: initial.Vendor_Name }).then((rates) => {
      const vendorLevel = (rates || []).filter((r) => !r.Document_Type);
      const loaded = vendorLevel.map((r) => ({
        id: 'rate_' + r.Rate_ID,
        service: r.Service_Name,
        isOther: !boardTypes.length ? true : !boardTypes.includes(r.Service_Name),
        rate: r.Rate,
        additionalRate: r.Additional_Rate || '',
        tat: r.Turnaround_Days || '',
        rateId: r.Rate_ID,
      }));
      setRows(loaded);
      setInitialRateIds(loaded.map((r) => r.rateId).filter(Boolean));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, initial?.Vendor_Name, boardTypes.length]);

  function toggleService(name, checked) {
    setRows((rs) => (
      checked ? [...rs, emptyRow(name, false)] : rs.filter((r) => !(r.service === name && !r.isOther))
    ));
  }
  function addOtherRow() {
    if (!otherText.trim()) return;
    setRows((rs) => [...rs, emptyRow(otherText.trim(), true)]);
    setOtherText('');
  }
  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }
  function setRowField(id, patch) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.Vendor_Name) return toast.error('Vendor name is required');
    if (rows.some((r) => !String(r.tat || '').trim())) return toast.error('Turnaround Time (TAT) is required for every ticked service');
    setSaving(true);
    try {
      // The old free-text Service_Type field is superseded by the tick-list
      // above, but it's still read elsewhere (vendors list column, vendor
      // profile subtitle, global search) — kept in sync automatically as a
      // comma-joined summary of the ticked services, so nothing that reads
      // it directly breaks or goes blank for a vendor set up through the
      // new tick-list.
      const serviceTypeSummary = rows.map((r) => r.service).filter(Boolean).join(', ');
      const payload = { ...form, Service_Type: serviceTypeSummary || form.Service_Type };

      let vendor;
      if (isEdit) { vendor = await api.updateVendor(payload); toast.success('Vendor updated'); }
      else { vendor = await api.addVendor(payload); toast.success('Vendor added'); }

      const vendorName = vendor?.Vendor_Name || form.Vendor_Name;
      await Promise.all(rows.map((r) => (
        r.rateId
          ? api.updateServiceRate({ Rate_ID: r.rateId, Vendor_Name: vendorName, Service_Name: r.service, Rate: Number(r.rate) || 0, Additional_Rate: Number(r.additionalRate) || 0, Turnaround_Days: r.tat, Document_Type: '' }).catch(() => {})
          : api.addServiceRate({ Vendor_Name: vendorName, Service_Name: r.service, Rate: Number(r.rate) || 0, Additional_Rate: Number(r.additionalRate) || 0, Turnaround_Days: r.tat, Document_Type: '' }).catch(() => {})
      )));
      // A service that was ticked when the form loaded but got unticked
      // before save no longer applies — remove its now-stale rate row too.
      const keptIds = rows.map((r) => r.rateId).filter(Boolean);
      const removedIds = initialRateIds.filter((id) => keptIds.indexOf(id) === -1);
      await Promise.all(removedIds.map((id) => api.deleteServiceRate(id).catch(() => {})));

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
        <label className="label">Address</label>
        <input className="input" value={form.Address} onChange={(e) => set('Address', e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="label mb-0">Services this vendor offers (tick all that apply)</label>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-50 border border-slate-100 p-3">
          {boardTypes.map((bt) => {
            const checked = rows.some((r) => r.service === bt && !r.isOther);
            return (
              <label key={bt} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={checked} onChange={(e) => toggleService(bt, e.target.checked)} />
                {bt}
              </label>
            );
          })}
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={otherOpen} onChange={(e) => setOtherOpen(e.target.checked)} />
            Other
          </label>
        </div>
        {otherOpen && (
          <div className="flex gap-2">
            <input className="input" placeholder="Type a service name" value={otherText} onChange={(e) => setOtherText(e.target.value)} />
            <button type="button" className="btn-secondary" onClick={addOtherRow}>Add</button>
          </div>
        )}

        {!rows.length && <p className="text-xs text-slate-400">No services ticked yet — tick one above, or add a custom one via "Other".</p>}

        {rows.length > 0 && (
          <div className="rounded-lg border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                {['#', 'Service', 'First Document', 'Additional Document', 'TAT', ''].map((h) => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="td text-slate-400">{i + 1}</td>
                    <td className="td font-medium">{r.service}</td>
                    <td className="td"><input type="number" className="input !py-1" value={r.rate} onChange={(e) => setRowField(r.id, { rate: e.target.value })} /></td>
                    <td className="td"><input type="number" className="input !py-1" value={r.additionalRate} onChange={(e) => setRowField(r.id, { additionalRate: e.target.value })} /></td>
                    <td className="td"><input className="input !py-1" placeholder="e.g. 3-4 days" value={r.tat} onChange={(e) => setRowField(r.id, { tat: e.target.value })} /></td>
                    <td className="td"><button type="button" className="btn-ghost !py-1" onClick={() => removeRow(r.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
