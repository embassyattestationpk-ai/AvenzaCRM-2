'use client';

import { useEffect, useState } from 'react';
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
