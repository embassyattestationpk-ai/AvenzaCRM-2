'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { money, fmtDate } from '../../lib/utils';
import Modal, { ConfirmModal } from '../../components/Modal';
import ClientForm from '../../components/ClientForm';
import { getCurrentUser, isAdmin } from '../../lib/auth';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [clientType, setClientType] = useState('');
  const [addedByFilter, setAddedByFilter] = useState('');
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // client obj or 'new'
  const [deleting, setDeleting] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
    if (isAdmin(u)) api.getUsers().then(setTeamUsers).catch(() => {});
  }, []);

  function load() {
    if (!user) return;
    setLoading(true);
    // Point 1: admin sees every client, staff only sees the ones they added.
    const addedBy = isAdmin(user) ? (addedByFilter || 'everyone') : user.fullName;
    api.getClients(q, clientType, addedBy).then(setClients).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, clientType, addedByFilter, user]);

  async function doDelete() {
    try {
      await api.deleteClient(deleting.Client_ID);
      toast.success('Client deleted');
      setDeleting(null);
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Clients</h1>
          <p className="text-sm text-slate-500">{clients.length} total</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>➕ Add Client</button>
      </div>

      <div className="card">
        <div className="flex gap-3 mb-4">
          <input className="input max-w-sm" placeholder="Search by name, phone, email, company…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input max-w-xs" value={clientType} onChange={(e) => setClientType(e.target.value)}>
            <option value="">All types</option>
            <option value="Walk-in">Walk-in</option>
            <option value="Consultant">Consultant</option>
          </select>
          {isAdmin(user) && (
            <select className="input max-w-xs" value={addedByFilter} onChange={(e) => setAddedByFilter(e.target.value)}>
              <option value="">All team members</option>
              {teamUsers.map((u) => <option key={u.Username} value={u.Full_Name}>{u.Full_Name}</option>)}
            </select>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              {['Client Name', 'Type', 'Phone', 'Email', 'Company / ID Card', 'Total Cases', 'Total Paid', 'Pending', 'Last Activity', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="td text-center text-slate-400 py-8">Loading…</td></tr>}
              {!loading && clients.length === 0 && <tr><td colSpan={10} className="td text-center text-slate-400 py-8">No clients yet</td></tr>}
              {clients.map((c) => (
                <tr key={c.Client_ID} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="td"><Link href={`/clients/${c.Client_ID}`} className="font-medium text-brand-700 hover:underline">{c.Client_Name}</Link></td>
                  <td className="td">
                    <span className={`badge ${c.Client_Type === 'Consultant' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>{c.Client_Type || 'Walk-in'}</span>
                  </td>
                  <td className="td">{c.Phone}</td>
                  <td className="td">{c.Email}</td>
                  <td className="td">{c.Client_Type === 'Consultant' ? c.Company : c.ID_Card_Number}</td>
                  <td className="td">{c.Total_Cases}</td>
                  <td className="td">{money(c.Total_Paid)}</td>
                  <td className="td text-red-600 font-medium">{money(c.Pending_Amount)}</td>
                  <td className="td">{fmtDate(c.Last_Activity)}</td>
                  <td className="td">
                    <div className="flex gap-2">
                      <button className="btn-ghost" onClick={() => setEditing(c)}>Edit</button>
                      <button className="btn-danger" onClick={() => setDeleting(c)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add Client' : 'Edit Client'} onClose={() => setEditing(null)}>
          <ClientForm initial={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}

      {deleting && (
        <ConfirmModal message={`Delete client "${deleting.Client_Name}"? This can be restored by an admin later.`} onCancel={() => setDeleting(null)} onConfirm={doDelete} />
      )}
    </div>
  );
}
