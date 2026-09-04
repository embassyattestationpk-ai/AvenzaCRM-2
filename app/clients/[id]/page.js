'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { money, fmtDate } from '../../../lib/utils';
import StatusBadge from '../../../components/StatusBadge';
import StatCard from '../../../components/StatCard';

export default function ClientProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    api.getClient(id).then(setProfile).catch((e) => toast.error(e.message));
  }, [id]);

  if (!profile) return <div className="text-slate-400">Loading…</div>;
  const { client, cases, payments, totalRevenue, totalPaid, pendingBalance } = profile;

  return (
    <div className="space-y-6">
      <button className="text-sm text-brand-600" onClick={() => router.back()}>← Back</button>

      <div className="card flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{client.Client_Name}</h1>
          <p className="text-sm text-slate-500">{client.Company}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-slate-600">
            <div><span className="text-slate-400">Phone:</span> {client.Phone || '-'}</div>
            <div><span className="text-slate-400">Email:</span> {client.Email || '-'}</div>
            <div><span className="text-slate-400">Address:</span> {client.Address || '-'}</div>
            <div><span className="text-slate-400">Client since:</span> {fmtDate(client.Created_Date)}</div>
          </div>
          {client.Notes && <p className="mt-3 text-sm text-slate-500 italic">"{client.Notes}"</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Revenue Generated" value={money(totalRevenue)} icon="💵" tone="brand" />
        <StatCard label="Total Paid" value={money(totalPaid)} icon="✅" tone="green" />
        <StatCard label="Pending Balance" value={money(pendingBalance)} icon="🕐" tone="red" />
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-700 mb-4">All Cases / Services Taken ({cases.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              {['Case ID', 'Date', 'Service', 'Vendor', 'Docs', 'Client Payment', 'Vendor Payment', 'Profit', 'Status', 'Return Date'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.Case_ID} className="border-b border-slate-50">
                  <td className="td font-mono text-xs">{c.Case_ID}</td>
                  <td className="td">{fmtDate(c.Date)}</td>
                  <td className="td">{c.Service}</td>
                  <td className="td">{c.Vendor}</td>
                  <td className="td">{c.No_of_Documents}</td>
                  <td className="td">{money(c.Client_Payment)}</td>
                  <td className="td">{money(c.Vendor_Payment)}</td>
                  <td className="td text-emerald-600 font-semibold">{money(c.Profit)}</td>
                  <td className="td"><StatusBadge status={c.Document_Status} /></td>
                  <td className="td">{fmtDate(c.Actual_Return_Date || c.Expected_Return_Date)}</td>
                </tr>
              ))}
              {!cases.length && <tr><td colSpan={10} className="td text-center text-slate-400 py-6">No cases yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-700 mb-4">Payment History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              {['Date', 'Case', 'Total', 'Paid', 'Remaining', 'Method', 'Notes'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.Payment_ID} className="border-b border-slate-50">
                  <td className="td">{fmtDate(p.Date)}</td>
                  <td className="td font-mono text-xs">{p.Case_ID}</td>
                  <td className="td">{money(p.Total_Amount)}</td>
                  <td className="td text-emerald-600">{money(p.Paid_Amount)}</td>
                  <td className="td text-red-600">{money(p.Remaining_Amount)}</td>
                  <td className="td">{p.Payment_Method}</td>
                  <td className="td">{p.Notes}</td>
                </tr>
              ))}
              {!payments.length && <tr><td colSpan={7} className="td text-center text-slate-400 py-6">No payments recorded</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
