'use client';

import { useEffect, useState, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../lib/api';
import { money, fmtDate } from '../lib/utils';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';
import { getCurrentUser, isAdmin } from '../lib/auth';

const COLORS = ['#3179ff', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#64748b', '#eab308'];

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);
  const [teamUsers, setTeamUsers] = useState([]);
  const [scope, setScope] = useState(''); // '' = everyone (admin only)

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
    if (isAdmin(u)) api.getUsers().then(setTeamUsers).catch(() => {});
  }, []);

  useEffect(() => { if (user) load(); }, [user, scope]);

  function load() {
    const addedBy = isAdmin(user) ? (scope || undefined) : user.fullName;
    api.getDashboard({ addedBy }).then(setData).catch((e) => toast.error(e.message));
  }

  if (!data) return <Loading />;
  const t = data.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {isAdmin(user) ? 'Live overview synced from Google Sheets' : `Your entries — ${user?.fullName}`}
          </p>
        </div>
        {isAdmin(user) && (
          <select className="input max-w-xs" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Everyone (Admin view)</option>
            {teamUsers.map((u) => <option key={u.Username} value={u.Full_Name}>{u.Full_Name}'s entries</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={t.totalClients} icon="👥" tone="brand" />
        <StatCard label="Total Cases" value={t.totalCases} icon="📁" tone="slate" />
        <StatCard label="Active Cases" value={t.activeCases} icon="⏳" tone="amber" />
        <StatCard label="Pending Cases" value={t.pendingCases} icon="🕐" tone="red" />
        <StatCard label="Completed Cases" value={t.completedCases} icon="✅" tone="green" />
        <StatCard label="Total Client Payments" value={money(t.totalClientPayment)} icon="💵" tone="brand" />
        <StatCard label="Total Vendor Payments" value={money(t.totalVendorPayment)} icon="🏢" tone="purple" />
        <StatCard label="Total Profit" value={money(t.totalProfit)} icon="📈" tone="green" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Today's Entries" value={t.todayCount} icon="📅" tone="slate" />
        <StatCard label="This Week's Entries" value={t.weekCount} icon="🗓️" tone="slate" />
        <StatCard label="This Month's Entries" value={t.monthCount} icon="📆" tone="slate" />
      </div>

      {/* PHASE 16 (Part B) — case-status counts derived via getCaseServices()
          on the backend, so services-mode cases AND every legacy shape
          (boards/single/multi-doc) are counted the same way. */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Completed This Month" value={t.completedThisMonth ?? 0} icon="🏁" tone="green" />
        <StatCard label="On Hold" value={t.onHoldCases ?? 0} icon="⏸️" tone="amber" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-4">Monthly Revenue & Profit</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3179ff" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#22c55e" strokeWidth={2} />
              <Line type="monotone" dataKey="expense" name="Vendor Expense" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-4">Case Status Overview</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.statusBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {data.statusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-4">Service-wise Revenue</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.serviceRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="service" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="revenue" fill="#3179ff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-4">Vendor-wise Expenses</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.vendorExpense}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="vendor" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="expense" fill="#a855f7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PHASE 16 (Part B) — document counts by Service and by Document Type,
          across every case (services-mode + legacy), via getCaseServices(). */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-4">Documents by Service</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.byServiceCounts || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="service" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Documents" fill="#3179ff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-4">Documents by Document Type</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.byDocumentTypeCounts || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="documentType" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Documents" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PHASE 16 (Part B) — per-entity case-wise detail: click a row to see
          every document that entity is tied to, with its amount and status. */}
      <EntityDetailTable title="Vendor Case-wise Detail" data={data.vendorCaseDetail || []} amountLabel="Payable" />
      <EntityDetailTable title="Consultant Case-wise Detail" data={data.consultantCaseDetail || []} amountLabel="Billed" />
      <EntityDetailTable title="Client Case-wise Detail" data={data.clientCaseDetail || []} amountLabel="Billed" />

      <div className="card">
        <h3 className="font-semibold text-slate-700 mb-4">Recent Entries</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              {['Date', 'Client Name', 'Service', 'Vendor', 'Documents', 'Client Payment', 'Vendor Payment', 'Profit', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.Case_ID} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="td">{fmtDate(r.Date)}</td>
                  <td className="td font-medium">{r.Client_Name}</td>
                  <td className="td">{r.Service}</td>
                  <td className="td">{r.Vendor}</td>
                  <td className="td">{r.No_of_Documents}</td>
                  <td className="td">{money(r.Client_Payment)}</td>
                  <td className="td">{money(r.Vendor_Payment)}</td>
                  <td className="td font-semibold text-emerald-600">{money(r.Profit)}</td>
                  <td className="td"><StatusBadge status={r.Document_Status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center h-64 text-slate-400">Loading dashboard…</div>;
}

// PHASE 16 (Part B) — a click-to-expand table: one row per entity (vendor /
// consultant / client) with its total document count and total amount;
// clicking a row expands an inline list of every document tied to it
// (case, service, document type, amount, status). Kept to plain
// table/div markup — no new charting dependency, matching the existing
// dashboard's look.
function EntityDetailTable({ title, data, amountLabel }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="card">
      <h3 className="font-semibold text-slate-700 mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {['Name', 'Documents', `Total ${amountLabel}`, ''].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {data.map((e) => {
              const total = e.documents.reduce((s, d) => s + (Number(d.amount) || 0), 0);
              const isOpen = expanded === e.name;
              return (
                <Fragment key={e.name}>
                  <tr className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(isOpen ? null : e.name)}>
                    <td className="td font-medium">{e.name}</td>
                    <td className="td">{e.documents.length}</td>
                    <td className="td">{money(total)}</td>
                    <td className="td text-xs text-brand-600">{isOpen ? 'Hide' : 'View'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-slate-50 bg-slate-50">
                      <td colSpan={4} className="td">
                        <div className="space-y-1 py-1">
                          {e.documents.map((d, i) => (
                            <div key={i} className="flex items-center justify-between text-xs text-slate-500 gap-2">
                              <span className="flex-1">{d.caseId} — {d.service}{d.documentType ? ` / ${d.documentType}` : ''}{d.client ? ` — ${d.client}` : ''}</span>
                              <span className="flex items-center gap-2">{money(d.amount)} <StatusBadge status={d.status} /></span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!data.length && <tr><td colSpan={4} className="td text-center text-slate-400 py-6">No data yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
