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

export default function CasesPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', client: '', vendor: '', service: '', status: '', dateFrom: '', dateTo: '', addedBy: '', clientType: '' });
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
          <input className="input" placeholder="Client" value={filters.client} onChange={(e) => setFilter('client', e.target.value)} />
          <input className="input" placeholder="Vendor" value={filters.vendor} onChange={(e) => setFilter('vendor', e.target.value)} />
          <input className="input" placeholder="Service" value={filters.service} onChange={(e) => setFilter('service', e.target.value)} />
          <select className="input" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
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
                    <button className="btn-secondary" onClick={() => setChangingStatus(c)}>Change Status</button>
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
          {viewing.Process_Mode === 'process' && viewing.Stages_JSON && (
            <StagesView stagesJson={viewing.Stages_JSON} currentIndex={viewing.Current_Stage_Index} />
          )}
          {viewing.Case_Mode === 'multiple' && viewing.Boards_JSON && (
            <BoardsView boardsJson={viewing.Boards_JSON} />
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm mt-4">
            {Object.entries(viewing).filter(([k]) => k !== 'Deleted' && k !== 'Stages_JSON' && k !== 'Boards_JSON').map(([k, v]) => (
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

      {changingStatus && (
        <ChangeStatusModal caseObj={changingStatus} onClose={() => setChangingStatus(null)} onDone={() => { setChangingStatus(null); load(); }} />
      )}
    </div>
  );
}

// Point 3: a quick "Change Status" action next to Invoice. For a "multiple"
// (boards) case, each board (IBCC, MOFA, HEC…) gets its own status + a
// same-vendor/change-vendor reconfirmation (point 9). For a plain single
// case, it's just a straight status dropdown.
function ChangeStatusModal({ caseObj, onClose, onDone }) {
  const isMultiple = caseObj.Case_Mode === 'multiple' && caseObj.Boards_JSON;
  const [status, setStatus] = useState(caseObj.Document_Status);
  const [saving, setSaving] = useState(false);

  let boards = [];
  try { boards = isMultiple ? JSON.parse(caseObj.Boards_JSON) : []; } catch { boards = []; }
  const [boardEdits, setBoardEdits] = useState(() => boards.map((b) => ({ status: b.status, vendor: b.vendor, changeVendor: false, newVendor: '', vendorRate: b.vendorRate, payAmount: 0 })));
  const [vendors, setVendors] = useState([]);

  useEffect(() => { if (isMultiple) api.getVendors().then(setVendors).catch(() => {}); }, [isMultiple]);

  function editBoard(i, patch) {
    setBoardEdits((arr) => arr.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  async function saveSingle() {
    setSaving(true);
    try {
      await api.updateCase({ Case_ID: caseObj.Case_ID, Document_Status: status });
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
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button disabled={saving} className="btn-primary" onClick={saveSingle}>{saving ? 'Saving…' : 'Save'}</button>
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
          const totalVendor = Number(b.vendorRate || 0) + Number(b.vendorAdjustment || 0);
          return (
            <div key={i} className="rounded-lg border border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{b.board} <span className="text-slate-400 font-normal">({b.documentType || '—'})</span></div>
                <div className="text-xs text-slate-500">Vendor payment: {paidSoFar} / {totalVendor}</div>
              </div>
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
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button disabled={saving} className="btn-primary" onClick={saveBoards}>{saving ? 'Saving…' : 'Save All'}</button>
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
      {boards.map((b, i) => (
        <div key={i} className="flex items-center justify-between text-sm px-2 py-1.5 rounded bg-slate-50">
          <span className="font-medium">{b.board}</span>
          <span className="text-slate-500 text-xs">{b.documentType || '—'}</span>
          <span className="text-slate-500">{b.vendor || '—'}</span>
          <span>{money(Number(b.vendorRate || 0) + Number(b.vendorAdjustment || 0))} <span className="text-xs text-slate-400">(paid {money(b.vendorPaid || 0)})</span></span>
          <StatusBadge status={b.status} />
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
