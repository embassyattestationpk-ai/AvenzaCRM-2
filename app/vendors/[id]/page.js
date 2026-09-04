'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { money, fmtDate } from '../../../lib/utils';
import StatusBadge from '../../../components/StatusBadge';
import StatCard from '../../../components/StatCard';

export default function VendorProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const [profile, setProfile] = useState(null);

  useEffect(() => { api.getVendor(id).then(setProfile).catch((e) => toast.error(e.message)); }, [id]);
  if (!profile) return <div className="text-slate-400">Loading…</div>;
  const { vendor, cases, totalPayable, totalPaid, pending } = profile;

  return (
    <div className="space-y-6">
      <button className="text-sm text-brand-600" onClick={() => router.back()}>← Back</button>
      <div className="card">
        <h1 className="text-xl font-bold text-slate-800">{vendor.Vendor_Name}</h1>
        <p className="text-sm text-slate-500">{vendor.Service_Type}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-slate-600">
          <div><span className="text-slate-400">Phone:</span> {vendor.Phone || '-'}</div>
          <div><span className="text-slate-400">Email:</span> {vendor.Email || '-'}</div>
          <div><span className="text-slate-400">Status:</span> {vendor.Status}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Payable" value={money(totalPayable)} icon="💵" tone="brand" />
        <StatCard label="Total Paid" value={money(totalPaid)} icon="✅" tone="green" />
        <StatCard label="Pending Payment" value={money(pending)} icon="🕐" tone="red" />
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-700 mb-4">Recent Cases ({cases.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              {['Case ID', 'Date', 'Client', 'Service', 'Docs', 'Vendor Payment', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.Case_ID} className="border-b border-slate-50">
                  <td className="td font-mono text-xs">{c.Case_ID}</td>
                  <td className="td">{fmtDate(c.Date)}</td>
                  <td className="td">{c.Client_Name}</td>
                  <td className="td">{c.Service}</td>
                  <td className="td">{c.No_of_Documents}</td>
                  <td className="td">{money(c.Vendor_Payment)}</td>
                  <td className="td"><StatusBadge status={c.Document_Status} /></td>
                </tr>
              ))}
              {!cases.length && <tr><td colSpan={7} className="td text-center text-slate-400 py-6">No cases yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
