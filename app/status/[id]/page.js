'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { money, fmtDate, statusColor } from '../../../lib/utils';

export default function PublicStatusPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCaseStatus(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {error && (
          <div className="bg-white rounded-2xl shadow-card p-8 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <p className="text-slate-600">{error}</p>
          </div>
        )}

        {!data && !error && (
          <div className="text-center text-slate-400">Loading status…</div>
        )}

        {data && (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt={data.company_name || 'Logo'} className="h-8 w-auto object-contain bg-white rounded p-1" />
              <div>
                <div className="text-xs text-slate-300">{data.company_name || 'Document Status'}</div>
                <div className="text-lg font-bold mt-0.5">Case {data.Case_ID}</div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Current Status</span>
                <span className={`badge ${statusColor(data.Document_Status)}`}>{data.Document_Status}</span>
              </div>
              <Row label="Client" value={data.Client_Name} />
              <Row label="Service" value={data.Service} />
              <Row label="No. of Documents" value={data.No_of_Documents} />
              <Row label="Submitted On" value={fmtDate(data.Date)} />
              <Row label="Expected Return" value={fmtDate(data.Expected_Return_Date)} />
              {data.Actual_Return_Date && <Row label="Returned On" value={fmtDate(data.Actual_Return_Date)} />}

              {data.Stages && data.Stages.length > 0 && (
                <div className="border-t border-slate-100 pt-4 mt-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Progress</div>
                  <div className="space-y-1.5">
                    {data.Stages.map((st, i) => (
                      <div key={i} className={`flex items-center justify-between text-sm px-2 py-1.5 rounded ${st.status === 'Completed' ? 'bg-emerald-50' : st.status === 'Processing' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <span className="font-medium">{i + 1}. {st.name}</span>
                        <span className={`badge ${statusColor(st.status)}`}>{st.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.Boards && data.Boards.length > 0 && (
                <div className="border-t border-slate-100 pt-4 mt-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Documents / Boards</div>
                  <div className="space-y-1.5">
                    {data.Boards.map((b, i) => (
                      <div key={i} className={`flex items-center justify-between text-sm px-2 py-1.5 rounded ${b.status === 'Delivered' ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                        <div>
                          <div className="font-medium">{b.name}</div>
                          {b.documentType && <div className="text-xs text-slate-400">{b.documentType}</div>}
                        </div>
                        <span className={`badge ${statusColor(b.status)}`}>{b.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 mt-2 space-y-2">
                <Row label="Total Amount" value={money(data.Total_Amount)} />
                <Row label="Paid" value={money(data.Paid_Amount)} valueClass="text-emerald-600 font-semibold" />
                <Row label="Remaining" value={money(data.Remaining_Amount)} valueClass="text-red-600 font-semibold" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, valueClass = 'text-slate-800 font-medium' }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={valueClass}>{value ?? '-'}</span>
    </div>
  );
}
