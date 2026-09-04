'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { money } from '../../lib/utils';
import Modal, { ConfirmModal } from '../../components/Modal';
import VendorForm from '../../components/VendorForm';

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function load() {
    setLoading(true);
    api.getVendors(q).then(setVendors).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);

  async function doDelete() {
    try { await api.deleteVendor(deleting.Vendor_ID); toast.success('Vendor deleted'); setDeleting(null); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Vendors</h1>
          <p className="text-sm text-slate-500">{vendors.length} total</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>➕ Add Vendor</button>
      </div>

      <div className="card">
        <input className="input max-w-sm mb-4" placeholder="Search by name, phone, service type…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              {['Vendor Name', 'Phone', 'Service Type', 'Status', 'Total Cases', 'Total Paid', 'Pending', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="td text-center text-slate-400 py-8">Loading…</td></tr>}
              {!loading && !vendors.length && <tr><td colSpan={8} className="td text-center text-slate-400 py-8">No vendors yet</td></tr>}
              {vendors.map((v) => (
                <tr key={v.Vendor_ID} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="td"><Link href={`/vendors/${v.Vendor_ID}`} className="font-medium text-brand-700 hover:underline">{v.Vendor_Name}</Link></td>
                  <td className="td">{v.Phone}</td>
                  <td className="td">{v.Service_Type}</td>
                  <td className="td">{v.Status}</td>
                  <td className="td">{v.Total_Cases}</td>
                  <td className="td">{money(v.Total_Paid)}</td>
                  <td className="td text-red-600 font-medium">{money(v.Pending_Payment)}</td>
                  <td className="td">
                    <div className="flex gap-2">
                      <button className="btn-ghost" onClick={() => setEditing(v)}>Edit</button>
                      <button className="btn-danger" onClick={() => setDeleting(v)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add Vendor' : 'Edit Vendor'} onClose={() => setEditing(null)}>
          <VendorForm initial={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {deleting && <ConfirmModal message={`Delete vendor "${deleting.Vendor_Name}"?`} onCancel={() => setDeleting(null)} onConfirm={doDelete} />}
    </div>
  );
}
