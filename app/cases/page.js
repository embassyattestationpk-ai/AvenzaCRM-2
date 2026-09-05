'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { money, fmtDate, exportCSV, exportExcel, downloadBase64File } from '../../lib/utils';
import StatusBadge from '../../components/StatusBadge';
import Modal, { ConfirmModal } from '../../components/Modal';
import CaseForm from '../../components/CaseForm';
import { getCurrentUser, isAdmin } from '../../lib/auth';

const STATUS_OPTIONS = ['New', 'Documents Received', 'Processing', 'Sent to Vendor', 'Pending', 'Completed', 'Returned to Client', 'Cancelled'];
const BOARD_STATUS_OPTIONS = ['Document Received', 'Sent to Vendor', 'Hold', 'Return with Payment', 'Return without Payment', 'Delivered with Payment', 'Delivered without Payment'];
const PAGE_SIZE = 15;

// Backward-compatible reader for a board's documents — mirrors
// getBoardDocuments() in Code.gs (point 7). A board saved before the
// multi-document change has flat documentType/vendorRate/... fields
// directly on it instead of a `documents` array; this always returns an
// array so every UI spot can treat both shapes the same way.
function getBoardDocuments(board) {
  if (!board) return [];
  if (Array.isArray(board.documents) && board.documents.length) return board.documents;
  return [{
    documentType: board.documentType || '',
    vendorRate: Number(board.vendorRate) || 0,
    vendorAdjustment: Number(board.vendorAdjustment) || 0,
    clientRate: Number(board.clientRate) || 0,
    clientAdjustment: Number(board.clientAdjustment) || 0,
  }];
}

// Backward-compatible reader for a single-mode case's documents (Phase 15)
// — mirrors getCaseDocuments() in Code.gs. A single-mode case saved before
// this phase has no Documents_JSON at all; synthesize a one-item array from
// the legacy flat Document_Type/Vendor_Payment/Client_Payment fields so
// every UI spot can treat both shapes the same way.
function getCaseDocuments(c) {
  if (!c) return [];
  if (c.Documents_JSON) {
    try {
      const docs = JSON.parse(c.Documents_JSON);
      if (Array.isArray(docs) && docs.length) return docs;
    } catch { /* fall through */ }
  }
  return [{
    documentType: c.Document_Type || '',
    vendorRate: Number(c.Vendor_Payment) || 0,
    vendorAdjustment: 0,
    clientRate: Number(c.Client_Payment) || 0,
    clientAdjustment: 0,
  }];
}

// PHASE 16 (Part A) — read-only view of a services-mode case's services and
// their documents. A services-mode case always has Services_JSON already
// (written at creation, or the first time updateDocumentStatus upgraded a
// legacy case), so no legacy synthesis is needed here — the backward-
// compatible synthesis for old cases lives server-side in getCaseServices()
// and is only reached when a bulk update is actually performed on them (via
// BulkDocumentModal, which fetches through the getCaseServices action).
function ServicesView({ servicesJson }) {
  let services = [];
  try { services = JSON.parse(servicesJson); } catch { services = []; }
  return (
    <div className="rounded-lg border border-slate-100 p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-500 uppercase">Services</div>
      {services.map((sv) => (
        <div key={sv.serviceId} className="rounded bg-slate-50 px-2 py-1.5 space-y-1">
          <div className="text-sm font-medium">{sv.service}{sv.urgency ? ` (${sv.urgency})` : ''}</div>
          <div className="pl-2 space-y-0.5">
            {(sv.documents || []).map((d) => (
              <div key={d.docId} className="flex items-center justify-between text-xs text-slate-500 gap-2">
                <span className="flex-1">{d.documentType || '—'} — {d.vendor || 'no vendor'}</span>
                <span>Vendor {money(Number(d.vendorRate || 0) + Number(d.vendorAdjustment || 0))} / Client {money(Number(d.clientRate || 0) + Number(d.clientAdjustment || 0))}</span>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// The bulk cross-service status/vendor/payment update panel — replaces
// "Change Status" for any case that already has Services_JSON (every new
// case, plus any legacy case that's been bulk-updated once before, since
// that upgrades it in place). Ticking any combination of documents across
// any number of services and applying one action to all of them is the
// confirmed core requirement of this phase; a single-document update is
// just this same UI with one checkbox ticked, no separate code path.
const DOC_TERMINAL_STATUSES = ['Return with Payment', 'Return without Payment', 'Delivered with Payment', 'Delivered without Payment'];

function BulkDocumentModal({ caseObj, onClose, onDone }) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState(['Cash']);
  const [selected, setSelected] = useState({});
  const [saving, setSaving] = useState(false);

  const [applyStatus, setApplyStatus] = useState(false);
  const [status, setStatus] = useState(BOARD_STATUS_OPTIONS[0]);
  const [applyVendor, setApplyVendor] = useState(false);
  const [vendor, setVendor] = useState('');
  const [vendorRate, setVendorRate] = useState('');
  const [applySent, setApplySent] = useState(false);
  const [sentDate, setSentDate] = useState('');
  const [applyReceived, setApplyReceived] = useState(false);
  const [receivedDate, setReceivedDate] = useState('');
  const [applyVendorPay, setApplyVendorPay] = useState(false);
  const [vendorPayAmount, setVendorPayAmount] = useState(0);
  const [applyNotes, setApplyNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const [balance, setBalance] = useState(null);
  const [settleMode, setSettleMode] = useState(null); // null | 'ask' | 'done'
  const [settleAmount, setSettleAmount] = useState(0);
  const [settleMethod, setSettleMethod] = useState('Cash');

  useEffect(() => {
    Promise.all([
      api.getCaseServices(caseObj.Case_ID),
      api.getVendors(),
      api.getBoardTypes(),
      api.getCaseBalance(caseObj.Case_ID),
    ]).then(([svc, v, bt, bal]) => {
      setServices(svc.services || []);
      setVendors(v);
      if (bt.paymentMethods?.length) setPaymentMethods(bt.paymentMethods);
      setBalance(bal);
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [caseObj.Case_ID]);

  function toggle(serviceId, docId) {
    const key = `${serviceId}::${docId}`;
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  }
  const selectedKeys = Object.keys(selected).filter((k) => selected[k]);

  function buildUpdates() {
    return selectedKeys.map((key) => {
      const [serviceId, docId] = key.split('::');
      const svc = services.find((s) => s.serviceId === serviceId);
      const doc = svc?.documents.find((d) => d.docId === docId);
      const u = { serviceId, docId };
      if (applyStatus) u.status = status;
      if (applyVendor) {
        u.vendor = vendor;
        if (vendorRate !== '') u.vendorRate = Number(vendorRate);
      }
      if (applySent) u.sentDate = sentDate;
      if (applyReceived) u.receivedDate = receivedDate;
      if (applyVendorPay && Number(vendorPayAmount) > 0 && doc) {
        u.vendorPaid = (Number(doc.vendorPaid) || 0) + Number(vendorPayAmount);
      }
      if (applyNotes) u.notes = notes;
      return u;
    });
  }

  // Point (Phase 16 balance popup): don't silently mark documents delivered
  // while the client still owes money — same settle-balance UX carried
  // forward from the legacy Change Status flow.
  function willMarkFinal() {
    return applyStatus && DOC_TERMINAL_STATUSES.includes(status);
  }

  function proceed() {
    if (!selectedKeys.length) { toast.error('Select at least one document'); return; }
    if (willMarkFinal() && balance && balance.balance > 0 && settleMode !== 'done') {
      setSettleAmount(balance.balance);
      setSettleMode('ask');
      return;
    }
    save();
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateDocumentStatus({ Case_ID: caseObj.Case_ID, Updates: buildUpdates() });
      toast.success(`${selectedKeys.length} document(s) updated`);
      onDone();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function settlePay() {
    setSaving(true);
    try {
      await api.addPayment({ Payment_Type: 'Client', Client_or_Vendor: caseObj.Client_Name, Case_ID: caseObj.Case_ID, Total_Amount: balance.billed, Paid_Amount: settleAmount, Payment_Method: settleMethod, Notes: 'Payment at delivery' });
      toast.success('Payment recorded');
      setSettleMode('done');
      await save();
    } catch (e) { toast.error(e.message); setSaving(false); }
  }
  async function settleWriteOff() {
    setSaving(true);
    try {
      await api.writeOffCase({ Case_ID: caseObj.Case_ID, Amount: settleAmount });
      toast.success('Booked as loss');
      setSettleMode('done');
      await save();
    } catch (e) { toast.error(e.message); setSaving(false); }
  }
  function skipSettle() { setSettleMode('done'); save(); }

  const settlePanel = settleMode === 'ask' && balance && (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
      <div className="text-sm font-semibold text-amber-800">Client balance is still PKR {balance.balance.toLocaleString()} outstanding</div>
      <p className="text-xs text-amber-700">Before marking as delivered: record the payment now, or book this as a loss.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Amount</label><input type="number" className="input" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} /></div>
        <div><label className="label">Payment Method</label><select className="input" value={settleMethod} onChange={(e) => setSettleMethod(e.target.value)}>{paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></div>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={saving} className="btn-primary" onClick={settlePay}>Payment Received — Record It</button>
        <button type="button" disabled={saving} className="btn-danger" onClick={settleWriteOff}>Book as Loss</button>
        <button type="button" disabled={saving} className="btn-ghost" onClick={skipSettle}>Skip (I'll do it later)</button>
      </div>
    </div>
  );

  return (
    <Modal title={`Update Documents — ${caseObj.Case_ID}`} onClose={onClose} width="max-w-3xl">
      {loading ? <div className="text-sm text-slate-400">Loading…</div> : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-100 divide-y divide-slate-50 max-h-64 overflow-y-auto">
            {!services.length && <div className="p-3 text-sm text-slate-400">No services on this case.</div>}
            {services.map((sv) => (
              <div key={sv.serviceId} className="p-2">
                <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{sv.service}{sv.urgency ? ` (${sv.urgency})` : ''}</div>
                {(sv.documents || []).map((d) => {
                  const key = `${sv.serviceId}::${d.docId}`;
                  return (
                    <label key={d.docId} className="flex items-center gap-2 text-sm px-1 py-1 hover:bg-slate-50 rounded cursor-pointer">
                      <input type="checkbox" checked={!!selected[key]} onChange={() => toggle(sv.serviceId, d.docId)} />
                      <span className="flex-1">{d.documentType || '—'}</span>
                      <span className="text-slate-400 text-xs">{d.vendor || 'no vendor'}</span>
                      <StatusBadge status={d.status} />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">{selectedKeys.length} document(s) selected — select any combination across service(s), even just one, and apply one action to all of them below.</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-slate-100 p-2 space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={applyStatus} onChange={(e) => setApplyStatus(e.target.checked)} /> Set Status</label>
              <select className="input" disabled={!applyStatus} value={status} onChange={(e) => setStatus(e.target.value)}>{BOARD_STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="rounded border border-slate-100 p-2 space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={applyVendor} onChange={(e) => setApplyVendor(e.target.checked)} /> Set / Change Vendor</label>
              <select className="input" disabled={!applyVendor} value={vendor} onChange={(e) => setVendor(e.target.value)}>
                <option value="">Select vendor</option>
                {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
              </select>
              <input type="number" className="input" placeholder="New vendor rate (optional)" disabled={!applyVendor} value={vendorRate} onChange={(e) => setVendorRate(e.target.value)} />
            </div>
            <div className="rounded border border-slate-100 p-2 space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={applySent} onChange={(e) => setApplySent(e.target.checked)} /> Set Sent Date</label>
              <input type="date" className="input" disabled={!applySent} value={sentDate} onChange={(e) => setSentDate(e.target.value)} />
            </div>
            <div className="rounded border border-slate-100 p-2 space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={applyReceived} onChange={(e) => setApplyReceived(e.target.checked)} /> Set Received Date</label>
              <input type="date" className="input" disabled={!applyReceived} value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className="rounded border border-slate-100 p-2 space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={applyVendorPay} onChange={(e) => setApplyVendorPay(e.target.checked)} /> Record Vendor Payment</label>
              <input type="number" className="input" disabled={!applyVendorPay} placeholder="Amount paid to vendor now" value={vendorPayAmount} onChange={(e) => setVendorPayAmount(e.target.value)} />
            </div>
            <div className="rounded border border-slate-100 p-2 space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={applyNotes} onChange={(e) => setApplyNotes(e.target.checked)} /> Set Notes</label>
              <input className="input" disabled={!applyNotes} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {settlePanel}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button disabled={saving} className="btn-primary" onClick={proceed}>{saving ? 'Saving…' : `Apply to ${selectedKeys.length} document(s)`}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function CasesPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', client: '', vendor: '', service: '', status: '', dateFrom: '', dateTo: '', addedBy: '', clientType: '', documentType: '', consultantName: '', idCard: '', mobile: '' });
  const [sortBy, setSortBy] = useState('Date');
  const [sortDir, setSortDir] = useState('desc');
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [invoicing, setInvoicing] = useState(null);
  const [advancing, setAdvancing] = useState(null);
  const [changingStatus, setChangingStatus] = useState(null);
  const [user, setUser] = useState(null);
  const [teamUsers, setTeamUsers] = useState([]);

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
    if (isAdmin(u)) api.getUsers().then(setTeamUsers).catch(() => {});
  }, []);

  function load() {
    if (!user) return;
    setLoading(true);
    const addedBy = isAdmin(user) ? (filters.addedBy || undefined) : user.fullName;
    api.getCases({ ...filters, addedBy, sortBy, sortDir, page, pageSize: PAGE_SIZE })
      .then((r) => { setRows(r.rows); setTotal(r.total); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [filters, sortBy, sortDir, page, user]);

  function setFilter(k, v) { setPage(1); setFilters((f) => ({ ...f, [k]: v })); }
  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }

  async function fetchAllForExport() {
    const r = await api.getCases({ ...filters, sortBy, sortDir });
    return r.rows.map((c) => ({
      'S.No': c.Case_ID, Date: fmtDate(c.Date), 'Client Name': c.Client_Name, Company: c.Company,
      Service: c.Service, Vendor: c.Vendor, 'No. of Documents': c.No_of_Documents,
      'Vendor Payment': c.Vendor_Payment, 'Client Payment': c.Client_Payment, Profit: c.Profit,
      'Document Status': c.Document_Status, 'Return Date': fmtDate(c.Actual_Return_Date || c.Expected_Return_Date),
    }));
  }

  async function doDelete() {
    try { await api.deleteCase(deleting.Case_ID); toast.success('Case deleted'); setDeleting(null); load(); }
    catch (e) { toast.error(e.message); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cases / Documents</h1>
          <p className="text-sm text-slate-500">{total} total records</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={async () => exportCSV('cases.csv', await fetchAllForExport())}>⬇ CSV</button>
          <button className="btn-secondary" onClick={async () => exportExcel('cases.xlsx', await fetchAllForExport())}>⬇ Excel</button>
          <button className="btn-secondary" onClick={() => window.print()}>🖨 Print</button>
          <button className="btn-primary" onClick={() => setEditing('new')}>➕ Add Case</button>
        </div>
      </div>

      <div className="card print:hidden">
        <div className="grid grid-cols-6 gap-3">
          <input className="input col-span-2" placeholder="Search everything…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          <input className="input" placeholder="Client Name" value={filters.client} onChange={(e) => setFilter('client', e.target.value)} />
          <input className="input" placeholder="Vendor Name" value={filters.vendor} onChange={(e) => setFilter('vendor', e.target.value)} />
          <input className="input" placeholder="Service" value={filters.service} onChange={(e) => setFilter('service', e.target.value)} />
          <select className="input" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
          {/* PHASE 16 (Part B) — additional search/filters: Document Type,
              Consultant Name, ID Card Number (CNIC), Mobile Number. These
              filter server-side over the same getCases() call the rest of
              this bar already uses, joined against the Clients sheet for
              ID Card/Mobile since those live on the client record. */}
          <input className="input" placeholder="Document Type" value={filters.documentType} onChange={(e) => setFilter('documentType', e.target.value)} />
          <input className="input" placeholder="Consultant Name" value={filters.consultantName} onChange={(e) => setFilter('consultantName', e.target.value)} />
          <input className="input" placeholder="ID Card Number (CNIC)" value={filters.idCard} onChange={(e) => setFilter('idCard', e.target.value)} />
          <input className="input" placeholder="Mobile Number" value={filters.mobile} onChange={(e) => setFilter('mobile', e.target.value)} />
          <input type="date" className="input" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} />
          <input type="date" className="input" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} />
          <select className="input" value={filters.clientType} onChange={(e) => setFilter('clientType', e.target.value)}>
            <option value="">All client types</option>
            <option value="Walk-in">Walk-in</option>
            <option value="Consultant">Consultant</option>
          </select>
          {isAdmin(user) && (
            <select className="input" value={filters.addedBy} onChange={(e) => setFilter('addedBy', e.target.value)}>
              <option value="">All team members</option>
              {teamUsers.map((u) => <option key={u.Username} value={u.Full_Name}>{u.Full_Name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {[
              ['Case_ID', 'S.No'], ['Date', 'Date'], ['Client_Name', 'Client Name'], ['Client_Type', 'Type'], ['Company', 'Client/Company'],
              ['Service', 'Service'], ['Vendor', 'Vendor'], ['No_of_Documents', 'Docs'], ['Vendor_Payment', 'Vendor Pmt'],
              ['Client_Payment', 'Client Pmt'], ['Profit', 'Profit'], ['Document_Status', 'Status'], ['Actual_Return_Date', 'Return Date'],
            ].map(([key, label]) => (
              <th key={key} className="th cursor-pointer select-none" onClick={() => toggleSort(key)}>
                {label} {sortBy === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
            <th className="th print:hidden">Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={14} className="td text-center text-slate-400 py-8">Loading…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={14} className="td text-center text-slate-400 py-8">No cases found</td></tr>}
            {rows.map((c) => {
              const isProcess = c.Process_Mode === 'process';
              const stageDone = isProcess && c.Stages_JSON ? (() => { try { return JSON.parse(c.Stages_JSON); } catch { return null; } })() : null;
              const canAdvance = isProcess && stageDone && Number(c.Current_Stage_Index) < stageDone.length;
              return (
              <tr key={c.Case_ID} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="td font-mono text-xs">{c.Case_ID}</td>
                <td className="td">{fmtDate(c.Date)}</td>
                <td className="td font-medium">{c.Client_Name}</td>
                <td className="td"><span className={`badge ${c.Client_Type === 'Consultant' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>{c.Client_Type || 'Walk-in'}</span></td>
                <td className="td">{c.Company}</td>
                <td className="td">{c.Service}{isProcess && <span className="ml-1 text-xs text-amber-600">(multi-step)</span>}</td>
                <td className="td">{c.Vendor}</td>
                <td className="td">{c.No_of_Documents}</td>
                <td className="td">{money(c.Vendor_Payment)}</td>
                <td className="td">{money(c.Client_Payment)}</td>
                <td className="td font-semibold text-emerald-600">{money(c.Profit)}</td>
                <td className="td"><StatusBadge status={c.Document_Status} /></td>
                <td className="td">{fmtDate(c.Actual_Return_Date || c.Expected_Return_Date)}</td>
                <td className="td print:hidden">
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn-ghost" onClick={() => setViewing(c)}>View</button>
                    <button className="btn-ghost" onClick={() => setEditing(c)}>Edit</button>
                    {canAdvance && <button className="btn-primary" onClick={() => setAdvancing(c)}>Advance Stage</button>}
                    <button className="btn-secondary" onClick={() => setInvoicing(c)}>Invoice</button>
                    <button className="btn-secondary" onClick={() => setChangingStatus(c)}>{c.Services_JSON ? 'Update Documents' : 'Change Status'}</button>
                    <button className="btn-danger" onClick={() => setDeleting(c)}>Delete</button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex items-center justify-between mt-4 print:hidden">
          <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {(editing) && (
        <Modal title={editing === 'new' ? 'Add New Case' : 'Edit Case'} onClose={() => setEditing(null)} width="max-w-2xl">
          <CaseForm initial={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}

      {viewing && (
        <Modal title={`Case ${viewing.Case_ID}`} onClose={() => setViewing(null)}>
          {viewing.Services_JSON && (
            <ServicesView servicesJson={viewing.Services_JSON} />
          )}
          {!viewing.Services_JSON && viewing.Process_Mode === 'process' && viewing.Stages_JSON && (
            <StagesView stagesJson={viewing.Stages_JSON} currentIndex={viewing.Current_Stage_Index} />
          )}
          {!viewing.Services_JSON && viewing.Case_Mode === 'multiple' && viewing.Boards_JSON && (
            <BoardsView boardsJson={viewing.Boards_JSON} />
          )}
          {!viewing.Services_JSON && viewing.Case_Mode !== 'multiple' && (
            <SingleDocumentsView caseObj={viewing} />
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm mt-4">
            {Object.entries(viewing).filter(([k]) => k !== 'Deleted' && k !== 'Stages_JSON' && k !== 'Boards_JSON' && k !== 'Documents_JSON' && k !== 'Services_JSON').map(([k, v]) => (
              <div key={k}><dt className="text-slate-400 text-xs">{k}</dt><dd className="font-medium">{String(v)}</dd></div>
            ))}
          </dl>
        </Modal>
      )}

      {deleting && (
        <ConfirmModal message={`Delete case ${deleting.Case_ID} for ${deleting.Client_Name}?`} onCancel={() => setDeleting(null)} onConfirm={doDelete} />
      )}

      {invoicing && (
        <InvoiceModal caseObj={invoicing} onClose={() => setInvoicing(null)} />
      )}

      {advancing && (
        <AdvanceStageModal caseObj={advancing} onClose={() => setAdvancing(null)} onDone={() => { setAdvancing(null); load(); }} />
      )}

      {changingStatus && (changingStatus.Services_JSON ? (
        <BulkDocumentModal caseObj={changingStatus} onClose={() => setChangingStatus(null)} onDone={() => { setChangingStatus(null); load(); }} />
      ) : (
        <ChangeStatusModal caseObj={changingStatus} onClose={() => setChangingStatus(null)} onDone={() => { setChangingStatus(null); load(); }} />
      ))}
    </div>
  );
}

// Point 3: a quick "Change Status" action next to Invoice. For a "multiple"
// (boards) case, each board (IBCC, MOFA, HEC…) gets its own status + a
// same-vendor/change-vendor reconfirmation (point 9). For a plain single
// case, it's a status dropdown with the same kind of payment protection —
// a vendor-payment prompt on "Sent to Vendor", a vendor-balance check before
// "Completed", and the client settle panel before a final status.
const FINAL_STATUSES = ['Completed', 'Returned to Client'];
const BOARD_DELIVERED_STATUSES = ['Delivered with Payment', 'Delivered without Payment'];

function ChangeStatusModal({ caseObj, onClose, onDone }) {
  const isMultiple = caseObj.Case_Mode === 'multiple' && caseObj.Boards_JSON;
  const [status, setStatus] = useState(caseObj.Document_Status);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState(null); // { billed, paid, writtenOff, balance }
  const [settleMode, setSettleMode] = useState(null); // null | 'ask' | 'pay' | 'writeoff' | 'done'
  const [settleAmount, setSettleAmount] = useState(0);
  const [settleMethod, setSettleMethod] = useState('Cash');
  const [paymentMethods, setPaymentMethods] = useState(['Cash']);
  const [pendingAction, setPendingAction] = useState(null); // function to run once settled

  // --- Single-mode vendor payment (point 3): "Sent to Vendor" prompts for
  // an optional vendor payment; before "Completed" we check whether the
  // vendor is fully paid and warn/offer to record the remainder.
  const [vendorPayAmount, setVendorPayAmount] = useState(0);
  const [vendorPayMethod, setVendorPayMethod] = useState('Cash');
  const [vendorPaid, setVendorPaid] = useState(0);
  const [vendorSettleMode, setVendorSettleMode] = useState(null); // null | 'ask' | 'done'
  const vendorTotal = Number(caseObj.Vendor_Payment) || 0;
  const vendorBalance = Math.max(vendorTotal - vendorPaid, 0);

  let boards = [];
  try { boards = isMultiple ? JSON.parse(caseObj.Boards_JSON) : []; } catch { boards = []; }
  const [boardEdits, setBoardEdits] = useState(() => boards.map((b) => ({ status: b.status, vendor: b.vendor, changeVendor: false, newVendor: '', vendorRate: getBoardDocuments(b)[0]?.vendorRate || 0, payAmount: 0 })));
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    if (isMultiple) api.getVendors().then(setVendors).catch(() => {});
    api.getCaseBalance(caseObj.Case_ID).then(setBalance).catch(() => {});
    api.getBoardTypes().then((o) => { if (o.paymentMethods?.length) setPaymentMethods(o.paymentMethods); }).catch(() => {});
    if (!isMultiple) {
      api.getPayments({ type: 'Vendor', caseId: caseObj.Case_ID }).then((rows) => {
        setVendorPaid((rows || []).reduce((s, r) => s + (Number(r.Paid_Amount) || 0), 0));
      }).catch(() => {});
    }
  }, [isMultiple, caseObj.Case_ID]);

  function editBoard(i, patch) {
    setBoardEdits((arr) => arr.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  // Point 9/10: don't silently mark something "delivered" while money is
  // still owed — ask whether to collect it now or book it as a loss.
  function needsSettling() {
    if (!balance || balance.balance <= 0) return false;
    if (!isMultiple) return FINAL_STATUSES.includes(status);
    return boardEdits.some((be) => BOARD_DELIVERED_STATUSES.includes(be.status));
  }

  // Point 3: before a single-mode case goes to "Completed", make sure the
  // vendor has actually been paid in full — same protection multi-board
  // cases already have on the client side.
  function needsVendorSettling() {
    if (isMultiple) return false;
    return status === 'Completed' && vendorBalance > 0;
  }

  function proceed(action) {
    if (needsVendorSettling() && vendorSettleMode !== 'done') {
      setVendorSettleMode('ask');
      setPendingAction(() => action);
      return;
    }
    if (needsSettling() && settleMode !== 'done') {
      setSettleAmount(balance.balance);
      setSettleMode('ask');
      setPendingAction(() => action);
      return;
    }
    action();
  }

  async function settlePay() {
    setSaving(true);
    try {
      await api.addPayment({ Payment_Type: 'Client', Client_or_Vendor: caseObj.Client_Name, Case_ID: caseObj.Case_ID, Total_Amount: balance.billed, Paid_Amount: settleAmount, Payment_Method: settleMethod, Notes: 'Payment at delivery' });
      toast.success('Payment recorded');
      setSettleMode('done');
      pendingAction && pendingAction();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function settleWriteOff() {
    setSaving(true);
    try {
      await api.writeOffCase({ Case_ID: caseObj.Case_ID, Amount: settleAmount });
      toast.success('Booked as loss');
      setSettleMode('done');
      pendingAction && pendingAction();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function settleVendorPay() {
    setSaving(true);
    try {
      await api.addPayment({ Payment_Type: 'Vendor', Client_or_Vendor: caseObj.Vendor, Case_ID: caseObj.Case_ID, Total_Amount: vendorTotal, Paid_Amount: vendorBalance, Payment_Method: vendorPayMethod, Notes: 'Vendor payment before marking Completed' });
      toast.success('Vendor payment recorded');
      setVendorPaid((p) => p + vendorBalance);
      setVendorSettleMode('done');
      pendingAction && pendingAction();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  function skipVendorSettle() {
    setVendorSettleMode('done');
    pendingAction && pendingAction();
  }

  async function saveSingle() {
    setSaving(true);
    try {
      await api.updateCase({ Case_ID: caseObj.Case_ID, Document_Status: status });
      // Optional vendor payment recorded alongside "Sent to Vendor" (point 3).
      if (status === 'Sent to Vendor' && Number(vendorPayAmount) > 0) {
        await api.addPayment({ Payment_Type: 'Vendor', Client_or_Vendor: caseObj.Vendor, Case_ID: caseObj.Case_ID, Total_Amount: vendorTotal, Paid_Amount: vendorPayAmount, Payment_Method: vendorPayMethod, Notes: 'Vendor payment at Sent to Vendor' });
      }
      toast.success('Status updated');
      onDone();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function saveBoards() {
    setSaving(true);
    try {
      for (let i = 0; i < boardEdits.length; i++) {
        const be = boardEdits[i];
        const payload = { Case_ID: caseObj.Case_ID, boardIndex: i, Status: be.status };
        if (be.changeVendor && be.newVendor) {
          payload.Vendor = be.newVendor;
          payload.Vendor_Rate = be.vendorRate;
        }
        await api.updateBoardStatus(payload);
        if (Number(be.payAmount) > 0) {
          await api.addBoardVendorPayment({ Case_ID: caseObj.Case_ID, boardIndex: i, Amount: be.payAmount });
        }
      }
      toast.success('Board statuses updated');
      onDone();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  const settlePanel = settleMode === 'ask' && (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
      <div className="text-sm font-semibold text-amber-800">Client balance is still PKR {balance.balance.toLocaleString()} outstanding</div>
      <p className="text-xs text-amber-700">Before marking as delivered: record the payment now, or book this as a loss.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount</label>
          <input type="number" className="input" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Payment Method</label>
          <select className="input" value={settleMethod} onChange={(e) => setSettleMethod(e.target.value)}>
            {paymentMethods.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={saving} className="btn-primary" onClick={settlePay}>Payment Received — Record It</button>
        <button type="button" disabled={saving} className="btn-danger" onClick={settleWriteOff}>Book as Loss</button>
        <button type="button" disabled={saving} className="btn-ghost" onClick={() => { setSettleMode('done'); pendingAction && pendingAction(); }}>Skip (I'll do it later)</button>
      </div>
    </div>
  );

  // Point 3: single-mode vendor-balance warning shown before "Completed".
  const vendorSettlePanel = vendorSettleMode === 'ask' && (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
      <div className="text-sm font-semibold text-amber-800">Vendor balance is still PKR {vendorBalance.toLocaleString()} unpaid</div>
      <p className="text-xs text-amber-700">Before marking as Completed: record the vendor payment now, or skip and settle it later.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount (full balance)</label>
          <input type="number" className="input" value={vendorBalance} disabled />
        </div>
        <div>
          <label className="label">Payment Method</label>
          <select className="input" value={vendorPayMethod} onChange={(e) => setVendorPayMethod(e.target.value)}>
            {paymentMethods.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={saving} className="btn-primary" onClick={settleVendorPay}>Payment Made — Record It</button>
        <button type="button" disabled={saving} className="btn-ghost" onClick={skipVendorSettle}>Skip (I'll do it later)</button>
      </div>
    </div>
  );

  if (!isMultiple) {
    return (
      <Modal title={`Change Status — ${caseObj.Case_ID}`} onClose={onClose} width="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="label">Document Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {/* Point 3: optional vendor payment prompt on "Sent to Vendor" */}
          {status === 'Sent to Vendor' && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-700">Vendor Payment (optional)</div>
              <p className="text-xs text-slate-500">Has anything been paid to the vendor so far? Enter it here — leave at 0 if not yet.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount Paid</label>
                  <input type="number" min="0" className="input" value={vendorPayAmount} onChange={(e) => setVendorPayAmount(e.target.value)} />
                </div>
                <div>
                  <label className="label">Payment Method</label>
                  <select className="input" value={vendorPayMethod} onChange={(e) => setVendorPayMethod(e.target.value)}>
                    {paymentMethods.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
          {vendorSettlePanel}
          {settlePanel}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button disabled={saving} className="btn-primary" onClick={() => proceed(saveSingle)}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Change Status — ${caseObj.Case_ID}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-3">
        {boards.map((b, i) => {
          const be = boardEdits[i];
          const paidSoFar = Number(b.vendorPaid || 0);
          const docs = getBoardDocuments(b);
          const totalVendor = docs.reduce((s, d) => s + Number(d.vendorRate || 0) + Number(d.vendorAdjustment || 0), 0);
          const docsLabel = docs.map((d) => d.documentType || '—').join(', ');
          return (
            <div key={i} className="rounded-lg border border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{b.board} <span className="text-slate-400 font-normal">({docsLabel})</span></div>
                <div className="text-xs text-slate-500">Vendor payment: {paidSoFar} / {totalVendor}</div>
              </div>
              {docs.length > 1 && (
                <div className="text-xs text-slate-500 pl-1 space-y-0.5">
                  {docs.map((d, di) => (
                    <div key={di}>{d.documentType || '—'} — Vendor {Number(d.vendorRate || 0) + Number(d.vendorAdjustment || 0)} / Client {Number(d.clientRate || 0) + Number(d.clientAdjustment || 0)}</div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={be.status} onChange={(e) => editBoard(i, { status: e.target.value })}>
                    {BOARD_STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Vendor</label>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{b.vendor || '—'}</span>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={be.changeVendor} onChange={(e) => editBoard(i, { changeVendor: e.target.checked })} />
                      Change vendor?
                    </label>
                  </div>
                </div>
              </div>
              {be.changeVendor && (
                <div className="grid grid-cols-2 gap-3">
                  <select className="input" value={be.newVendor} onChange={(e) => editBoard(i, { newVendor: e.target.value })}>
                    <option value="">Select new vendor</option>
                    {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
                  </select>
                  <input type="number" className="input" placeholder="New vendor rate" value={be.vendorRate} onChange={(e) => editBoard(i, { vendorRate: e.target.value })} />
                </div>
              )}
              <div>
                <label className="label">Record vendor payment for this board</label>
                <input type="number" className="input" placeholder="Amount paid to vendor now" value={be.payAmount} onChange={(e) => editBoard(i, { payAmount: e.target.value })} />
              </div>
            </div>
          );
        })}
        {settlePanel}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button disabled={saving} className="btn-primary" onClick={() => proceed(saveBoards)}>{saving ? 'Saving…' : 'Save All'}</button>
        </div>
      </div>
    </Modal>
  );
}

function StagesView({ stagesJson, currentIndex }) {
  let stages = [];
  try { stages = JSON.parse(stagesJson); } catch { stages = []; }
  return (
    <div className="rounded-lg border border-slate-100 p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-500 uppercase">Stages</div>
      {stages.map((st, i) => (
        <div key={i} className={`flex items-center justify-between text-sm px-2 py-1.5 rounded ${i === Number(currentIndex) ? 'bg-amber-50' : st.status === 'Completed' ? 'bg-emerald-50' : 'bg-slate-50'}`}>
          <span className="font-medium">{i + 1}. {st.name}</span>
          <span className="text-slate-500">{st.vendor || '—'}</span>
          <span>{money ? money(Number(st.rate || 0) + Number(st.adjustment || 0)) : (Number(st.rate || 0) + Number(st.adjustment || 0))}</span>
          <StatusBadge status={st.status} />
        </div>
      ))}
    </div>
  );
}

function BoardsView({ boardsJson }) {
  let boards = [];
  try { boards = JSON.parse(boardsJson); } catch { boards = []; }
  return (
    <div className="rounded-lg border border-slate-100 p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-500 uppercase">Boards</div>
      {boards.map((b, i) => {
        const docs = getBoardDocuments(b);
        const totalVendor = docs.reduce((s, d) => s + Number(d.vendorRate || 0) + Number(d.vendorAdjustment || 0), 0);
        return (
          <div key={i} className="rounded bg-slate-50 px-2 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{b.board}</span>
              <span className="text-slate-500">{b.vendor || '—'}</span>
              <span>{money(totalVendor)} <span className="text-xs text-slate-400">(paid {money(b.vendorPaid || 0)})</span></span>
              <StatusBadge status={b.status} />
            </div>
            <div className="pl-2 space-y-0.5">
              {docs.map((d, di) => (
                <div key={di} className="flex items-center justify-between text-xs text-slate-500">
                  <span>{d.documentType || '—'}</span>
                  <span>Vendor {money(Number(d.vendorRate || 0) + Number(d.vendorAdjustment || 0))} / Client {money(Number(d.clientRate || 0) + Number(d.clientAdjustment || 0))}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Phase 15: shows a single-mode case's ticked documents when there's more
// than one — a legacy (or single-document) case has nothing extra to show
// beyond the flat fields already listed in the surrounding dl, so this
// renders nothing for it.
function SingleDocumentsView({ caseObj }) {
  const docs = getCaseDocuments(caseObj);
  if (docs.length <= 1) return null;
  return (
    <div className="rounded-lg border border-slate-100 p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-500 uppercase">Documents</div>
      {docs.map((d, i) => (
        <div key={i} className="flex items-center justify-between text-xs text-slate-500 px-2 py-1.5 rounded bg-slate-50">
          <span>{d.documentType || '—'}</span>
          <span>Vendor {money(Number(d.vendorRate || 0) + Number(d.vendorAdjustment || 0))} / Client {money(Number(d.clientRate || 0) + Number(d.clientAdjustment || 0))}</span>
        </div>
      ))}
    </div>
  );
}

function AdvanceStageModal({ caseObj, onClose, onDone }) {
  const [stages, setStages] = useState(null);
  const [idx, setIdx] = useState(0);
  const [vendors, setVendors] = useState([]);
  const [nextVendor, setNextVendor] = useState('');
  const [nextRate, setNextRate] = useState(0);
  const [nextAdjustment, setNextAdjustment] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getCaseStages(caseObj.Case_ID).then((r) => { setStages(r.stages); setIdx(r.currentStageIndex); }).catch((e) => toast.error(e.message));
    api.getVendors().then(setVendors).catch(() => {});
  }, [caseObj.Case_ID]);

  const isLast = stages ? idx === stages.length - 1 : false;

  async function submit() {
    setSaving(true);
    try {
      await api.advanceCaseStage({
        Case_ID: caseObj.Case_ID,
        Next_Vendor: nextVendor,
        Next_Rate: nextRate,
        Next_Adjustment: nextAdjustment,
      });
      toast.success(isLast ? 'Case marked completed' : 'Advanced to next stage');
      onDone();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Advance Stage — ${caseObj.Case_ID}`} onClose={onClose}>
      {!stages ? <div className="text-sm text-slate-400">Loading…</div> : (
        <div className="space-y-4">
          <StagesView stagesJson={JSON.stringify(stages)} currentIndex={idx} />
          <div className="text-sm text-slate-600">
            Marking <b>{stages[idx]?.name}</b> as completed{!isLast ? `, then moving to Stage ${idx + 2}: ${stages[idx + 1]?.name}` : ' — this is the final stage'}.
          </div>
          {!isLast && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Next Stage Vendor</label>
                <select className="input" value={nextVendor} onChange={(e) => setNextVendor(e.target.value)}>
                  <option value="">Select vendor</option>
                  {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Rate</label>
                <input type="number" className="input" value={nextRate} onChange={(e) => setNextRate(e.target.value)} />
              </div>
              <div>
                <label className="label">Adjustment (+/-)</label>
                <input type="number" className="input" value={nextAdjustment} onChange={(e) => setNextAdjustment(e.target.value)} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button disabled={saving} className="btn-primary" onClick={submit}>{saving ? 'Saving…' : isLast ? 'Mark Completed' : 'Advance Stage'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function InvoiceModal({ caseObj, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const statusUrl = typeof window !== 'undefined' ? `${window.location.origin}/status/${caseObj.Case_ID}` : '';

  async function download() {
    setDownloading(true);
    try {
      const r = await api.getInvoicePdf(caseObj.Case_ID);
      downloadBase64File(r.filename, r.base64, 'application/pdf');
      toast.success('Invoice downloaded');
    } catch (e) { toast.error(e.message); } finally { setDownloading(false); }
  }

  async function sendEmail() {
    setSending(true);
    try {
      const r = await api.sendInvoice(caseObj.Case_ID);
      toast.success(`Invoice emailed to ${r.to}`);
    } catch (e) { toast.error(e.message); } finally { setSending(false); }
  }

  return (
    <Modal title={`Invoice — ${caseObj.Case_ID}`} onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          Client: <span className="font-medium">{caseObj.Client_Name}</span><br />
          Service: <span className="font-medium">{caseObj.Service}</span><br />
          Amount: <span className="font-medium">{money(caseObj.Client_Payment)}</span>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 break-all">
          Client status link: {statusUrl || '(set Frontend URL in Settings to enable)'}
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1 justify-center" disabled={downloading} onClick={download}>
            {downloading ? 'Preparing…' : '⬇ Download PDF'}
          </button>
          <button className="btn-secondary flex-1 justify-center" disabled={sending} onClick={sendEmail}>
            {sending ? 'Sending…' : '✉ Email to Client'}
          </button>
        </div>
        <p className="text-xs text-slate-400">Emailing requires the client's email address to be saved on their profile, and the invoice PDF includes a QR code the client can scan to check status anytime.</p>
      </div>
    </Modal>
  );
}
