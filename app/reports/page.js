'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { money, fmtDate, exportCSV, exportExcel } from '../../lib/utils';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

function isoDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

const PRESETS = {
  Daily: () => ({ dateFrom: today(), dateTo: today() }),
  Weekly: () => ({ dateFrom: isoDaysAgo(6), dateTo: today() }),
  Monthly: () => ({ dateFrom: today().slice(0, 8) + '01', dateTo: today() }),
  Custom: () => ({ dateFrom: '', dateTo: '' }),
};

export default function ReportsPage() {
  const [preset, setPreset] = useState('Monthly');
  const [filters, setFilters] = useState({ ...PRESETS.Monthly(), client: '', vendor: '', service: '', status: '', clientType: '' });
  const [report, setReport] = useState(null);

  useEffect(() => { load(); }, [filters]);
  function load() {
    api.getReport(filters).then(setReport).catch((e) => toast.error(e.message));
  }
  function choosePreset(p) {
    setPreset(p);
    setFilters((f) => ({ ...f, ...PRESETS[p]() }));
  }
  function setFilter(k, v) { setFilters((f) => ({ ...f, [k]: v })); }

  function exportRows() {
    return report.cases.map((c) => ({
      Date: fmtDate(c.Date), Client: c.Client_Name, Service: c.Service, Vendor: c.Vendor,
      'Client Payment': c.Client_Payment, 'Vendor Payment': c.Vendor_Payment, Profit: c.Profit, Status: c.Document_Status,
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500">Financial and case performance summaries</p>
        </div>
        {report && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => exportCSV('report.csv', exportRows())}>⬇ CSV</button>
            <button className="btn-secondary" onClick={() => exportExcel('report.xlsx', exportRows())}>⬇ Excel</button>
            <button className="btn-secondary" onClick={() => window.print()}>🖨 Print</button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {Object.keys(PRESETS).map((p) => (
          <button key={p} onClick={() => choosePreset(p)} className={`px-4 py-2 rounded-lg text-sm font-medium ${preset === p ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {p}
          </button>
        ))}
      </div>

      <div className="card grid grid-cols-6 gap-3">
        <input type="date" className="input" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} />
        <input type="date" className="input" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} />
        <input className="input" placeholder="Client" value={filters.client} onChange={(e) => setFilter('client', e.target.value)} />
        <input className="input" placeholder="Vendor" value={filters.vendor} onChange={(e) => setFilter('vendor', e.target.value)} />
        <input className="input" placeholder="Service" value={filters.service} onChange={(e) => setFilter('service', e.target.value)} />
        <input className="input" placeholder="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} />
        <select className="input" value={filters.clientType} onChange={(e) => setFilter('clientType', e.target.value)}>
          <option value="">All client types</option>
          <option value="Walk-in">Walk-in</option>
          <option value="Consultant">Consultant</option>
        </select>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total Cases" value={report.summary.totalCases} icon="📁" tone="slate" />
            <StatCard label="Total Client Payments" value={money(report.summary.totalClientPayment)} icon="💵" tone="brand" />
            <StatCard label="Total Vendor Payments" value={money(report.summary.totalVendorPayment)} icon="🏢" tone="purple" />
            <StatCard label="Total Profit" value={money(report.summary.totalProfit)} icon="📈" tone="green" />
            <StatCard label="Pending Cases" value={report.summary.pendingCases} icon="🕐" tone="amber" />
            <StatCard label="Completed Cases" value={report.summary.completedCases} icon="✅" tone="green" />
            <StatCard label="Pending Client Payments" value={money(report.summary.pendingClientPayments)} icon="⚠️" tone="red" />
            <StatCard label="Pending Vendor Payments" value={money(report.summary.pendingVendorPayments)} icon="⚠️" tone="red" />
          </div>

          {report.consultantBreakdown && report.consultantBreakdown.length > 0 && (
            <div className="card overflow-x-auto">
              <h3 className="font-semibold text-slate-700 mb-3">Consultant-wise Breakdown</h3>
              <table className="w-full">
                <thead><tr className="border-b border-slate-100">
                  {['Consultant', 'Cases', 'Total Client Payment', 'Total Profit'].map((h) => <th key={h} className="th">{h}</th>)}
                </tr></thead>
                <tbody>
                  {report.consultantBreakdown.map((c) => (
                    <tr key={c.consultant} className="border-b border-slate-50">
                      <td className="td font-medium">{c.consultant}</td>
                      <td className="td">{c.caseCount}</td>
                      <td className="td">{money(c.totalClientPayment)}</td>
                      <td className="td text-emerald-600 font-semibold">{money(c.totalProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100">
                {['Date', 'Client', 'Service', 'Vendor', 'Client Payment', 'Vendor Payment', 'Profit', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {report.cases.map((c) => (
                  <tr key={c.Case_ID} className="border-b border-slate-50">
                    <td className="td">{fmtDate(c.Date)}</td>
                    <td className="td font-medium">{c.Client_Name}</td>
                    <td className="td">{c.Service}</td>
                    <td className="td">{c.Vendor}</td>
                    <td className="td">{money(c.Client_Payment)}</td>
                    <td className="td">{money(c.Vendor_Payment)}</td>
                    <td className="td text-emerald-600 font-semibold">{money(c.Profit)}</td>
                    <td className="td"><StatusBadge status={c.Document_Status} /></td>
                  </tr>
                ))}
                {!report.cases.length && <tr><td colSpan={8} className="td text-center text-slate-400 py-8">No records in this range</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
