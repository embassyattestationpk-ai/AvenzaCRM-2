'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { getCurrentUser } from '../lib/auth';

const STATUS_OPTIONS = ['New', 'Documents Received', 'Processing', 'Sent to Vendor', 'Pending', 'Completed', 'Returned to Client', 'Cancelled'];
const EMBASSY_OPTIONS = ['Qatar Embassy', 'Saudi Embassy', 'UAE Embassy', 'Kuwait Embassy', 'Bahrain Embassy', 'Oman Embassy', 'Other'];

// Backward-compatible reader for a board's documents — mirrors
// getBoardDocuments() in Code.gs. A board saved before the multi-document
// change (point 7) has flat documentType/vendorRate/... fields directly on
// it instead of a `documents` array; this always returns an array.
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

function emptyDocument() {
  return { documentType: '', documentTypeOther: '', vendorRate: 0, vendorAdjustment: 0, clientRate: 0, clientAdjustment: 0 };
}

function emptyBoardRow() {
  return { board: '', vendor: '', documents: [emptyDocument()] };
}

// Resolves a document-type dropdown value + its "Other" free text into the
// value actually saved (point 6): "Other" is never stored literally.
function resolveDocType(doc) {
  if (doc.documentType === 'Other') return (doc.documentTypeOther || '').trim() || 'Other';
  return doc.documentType || '';
}

export default function CaseForm({ initial, onSaved, onCancel }) {
  const isEdit = !!initial?.Case_ID;
  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [services, setServices] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [boardTypes, setBoardTypes] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    Date: new Date().toISOString().slice(0, 10),
    Client_Name: '',
    Client_ID: '',
    Client_Type: 'Walk-in',
    Company: '',
    Service: '',
    Vendor: '',
    No_of_Documents: 1,
    Vendor_Payment: 0,
    Client_Payment: 0,
    Special_Rate_Adjustment: 0,
    Document_Status: 'New',
    Expected_Return_Date: '',
    Actual_Return_Date: '',
    Notes: '',
    Case_Mode: 'single',
    Document_Type: '',
    Document_Type_Other: '',
    Embassy: '',
    Embassy_Other: '',
    Advance_Payment: 0,
    Advance_Payment_Method: 'Cash',
    ...initial,
  }));

  const [baseRate, setBaseRate] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState(['Cash']);

  // --- "Multiple" (board) mode state — point 7/8/9 ---
  // Board name is now free text (point 8) — boardTypes is only used as
  // datalist autocomplete suggestions, not a fixed dropdown. Each board can
  // hold multiple documents (point 7), each with its own rates.
  const [boardRows, setBoardRows] = useState([]);
  const isEditingBoardsCase = isEdit && initial?.Case_Mode === 'multiple' && initial?.Boards_JSON;
  let existingBoards = [];
  try { existingBoards = isEditingBoardsCase ? JSON.parse(initial.Boards_JSON) : []; } catch { existingBoards = []; }

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [inlineName, setInlineName] = useState('');

  useEffect(() => {
    Promise.all([api.getClients(), api.getVendors(), api.getServices(), api.getDocumentTypes(), api.getBoardTypes()])
      .then(([c, v, s, dt, bt]) => {
        setClients(c); setVendors(v); setServices(s); setDocTypes(dt); setBoardTypes(bt.boards || []);
        if (bt.paymentMethods?.length) setPaymentMethods(bt.paymentMethods);
      }).catch((e) => toast.error(e.message));
  }, []);

  const isMultiple = form.Case_Mode === 'multiple';
  const isConsultant = form.Client_Type === 'Consultant';
  const isEmbassyService = form.Service === 'Embassy Attestation';
  const consultants = useMemo(() => clients.filter((c) => c.Client_Type === 'Consultant'), [clients]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function pickClient(name) {
    const c = clients.find((c) => c.Client_Name === name);
    set('Client_Name', name);
    if (c) {
      set('Client_ID', c.Client_ID);
      set('Company', c.Company || form.Company);
      set('ID_Card_Number', c.ID_Card_Number || '');
    }
  }

  // --- Single mode: auto-fetch Service+Vendor rate (Walk-in) or
  // Consultant+Service rate (Consultant), editable on top — points 5 & 6.
  useEffect(() => {
    if (isEdit || isMultiple) return;
    if (isConsultant) {
      if (!form.Client_Name || !form.Service) return;
      api.getConsultantRates({ consultant: form.Client_Name, board: form.Service }).then((rates) => {
        const r = rates && rates[0];
        setBaseRate(r ? Number(r.Rate) : 0);
      }).catch(() => {});
    } else {
      if (!form.Service || !form.Vendor) return;
      api.getServiceRates({ service: form.Service, vendor: form.Vendor }).then((rates) => {
        const r = rates && rates[0];
        setBaseRate(r ? Number(r.Rate) : 0);
      }).catch(() => {});
    }
  }, [form.Service, form.Vendor, form.Client_Name, isConsultant, isMultiple, isEdit]);

  useEffect(() => {
    if (isEdit || isMultiple) return;
    if (isConsultant) {
      set('Client_Payment', Number(baseRate || 0) + Number(form.Special_Rate_Adjustment || 0));
    } else {
      set('Vendor_Payment', Number(baseRate || 0) + Number(form.Special_Rate_Adjustment || 0));
    }
  }, [baseRate, form.Special_Rate_Adjustment, isConsultant, isMultiple, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Total (Gross) amount the client is being billed — shown next to the
  // Advance Payment box (point 9) so staff can see the total while deciding
  // the advance amount, not just the Profit figure.
  const grossTotal = useMemo(() => {
    if (isMultiple) {
      return boardRows.reduce((s, row) => s + row.documents.reduce((s2, d) => s2 + (Number(d.clientRate) || 0) + (Number(d.clientAdjustment) || 0), 0), 0);
    }
    return Number(form.Client_Payment) || 0;
  }, [isMultiple, boardRows, form.Client_Payment]);

  const profit = useMemo(() => {
    if (isMultiple) {
      const vp = boardRows.reduce((s, row) => s + row.documents.reduce((s2, d) => s2 + (Number(d.vendorRate) || 0) + (Number(d.vendorAdjustment) || 0), 0), 0);
      return grossTotal - vp;
    }
    return (Number(form.Client_Payment) || 0) - (Number(form.Vendor_Payment) || 0);
  }, [isMultiple, boardRows, grossTotal, form.Client_Payment, form.Vendor_Payment]);

  function addBoardRow() {
    setBoardRows((rows) => [...rows, emptyBoardRow()]);
  }
  function removeBoardRow(idx) {
    setBoardRows((rows) => rows.filter((_, i) => i !== idx));
  }
  function setBoardRow(idx, patch) {
    setBoardRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addDocument(boardIdx) {
    setBoardRows((rows) => rows.map((r, i) => (i === boardIdx ? { ...r, documents: [...r.documents, emptyDocument()] } : r)));
  }
  function removeDocument(boardIdx, docIdx) {
    setBoardRows((rows) => rows.map((r, i) => (i === boardIdx ? { ...r, documents: r.documents.filter((_, di) => di !== docIdx) } : r)));
  }
  function setDocument(boardIdx, docIdx, patch) {
    setBoardRows((rows) => rows.map((r, i) => (
      i === boardIdx ? { ...r, documents: r.documents.map((d, di) => (di === docIdx ? { ...d, ...patch } : d)) } : r
    )));
  }

  // Auto-fetch rates when a board's vendor is picked — applies to the
  // board's first document, same idea as before (point 5/6 rate lookups).
  function onBoardVendorChange(boardIdx, vendorName) {
    setBoardRow(boardIdx, { vendor: vendorName });
    if (!vendorName) return;
    const boardName = boardRows[boardIdx]?.board;
    if (!boardName) return;
    api.getServiceRates({ service: boardName, vendor: vendorName }).then((rates) => {
      const r = rates && rates[0];
      if (r) setDocument(boardIdx, 0, { vendorRate: Number(r.Rate) });
    }).catch(() => {});
  }

  useEffect(() => {
    if (!isConsultant || !isMultiple || !form.Client_Name) return;
    boardRows.forEach((row, idx) => {
      if (!row.board) return;
      api.getConsultantRates({ consultant: form.Client_Name, board: row.board }).then((rates) => {
        const r = rates && rates[0];
        if (r) setDocument(idx, 0, { clientRate: Number(r.Rate) });
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConsultant, isMultiple, form.Client_Name, boardRows.map((r) => r.board).join(',')]);

  async function addInline(kind) {
    if (!inlineName.trim()) return;
    try {
      if (kind === 'client') {
        const user = getCurrentUser();
        const c = await api.addClient({ Client_Name: inlineName.trim(), Client_Type: form.Client_Type, Added_By: user?.fullName || '' });
        setClients((cs) => [...cs, c]);
        pickClient(c.Client_Name);
        setNewClientOpen(false);
      } else if (kind === 'vendor') {
        const v = await api.addVendor({ Vendor_Name: inlineName.trim() });
        setVendors((vs) => [...vs, v]);
        set('Vendor', v.Vendor_Name);
        setNewVendorOpen(false);
      } else if (kind === 'service') {
        const s = await api.addService({ Service_Name: inlineName.trim() });
        setServices((ss) => [...ss, s]);
        set('Service', s.Service_Name);
        setNewServiceOpen(false);
      }
      setInlineName('');
      toast.success('Added');
    } catch (e) { toast.error(e.message); }
  }

  // Resolves the final Document_Type saved on the case: "Other" free text
  // (point 6) plus, when the Service is "Embassy Attestation", the chosen
  // embassy appended (point 5) — e.g. "PCC - Qatar Embassy".
  function resolveCaseDocumentType() {
    let base = form.Document_Type === 'Other' ? ((form.Document_Type_Other || '').trim() || 'Other') : (form.Document_Type || '');
    if (isEmbassyService && form.Embassy) {
      const embassyName = form.Embassy === 'Other' ? ((form.Embassy_Other || '').trim() || 'Other') : form.Embassy;
      base = base ? `${base} - ${embassyName}` : `Embassy Attestation - ${embassyName}`;
    }
    return base;
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.Client_Name) return toast.error('Client name is required');
    if (isMultiple && !boardRows.length) return toast.error('Add at least one board');
    if (isMultiple && boardRows.some((r) => !r.board.trim())) return toast.error('Every board needs a name');
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, Added_By: initial?.Added_By || user?.fullName || '', Document_Type: resolveCaseDocumentType() };

      // Keep the client's own ID Card Number / Company in sync with what was
      // (re)typed on the case form, for an already-existing client.
      if (form.Client_ID && !isMultiple) {
        api.updateClient({ Client_ID: form.Client_ID, ID_Card_Number: form.ID_Card_Number, Company: form.Company }).catch(() => {});
      }

      if (isEdit) {
        payload.Profit = profit;
        await api.updateCase({ ...payload, Case_ID: initial.Case_ID });
        toast.success('Case updated');
      } else if (isMultiple) {
        const Boards = boardRows.map((row) => ({
          Board_Name: row.board.trim(),
          Vendor: row.vendor || '',
          Documents: row.documents.map((d) => ({
            Document_Type: resolveDocType(d),
            Vendor_Rate: Number(d.vendorRate) || 0,
            Vendor_Adjustment: Number(d.vendorAdjustment) || 0,
            Client_Rate: Number(d.clientRate) || 0,
            Client_Adjustment: Number(d.clientAdjustment) || 0,
          })),
        }));
        await api.addCase({ ...payload, Case_Mode: 'multiple', Boards, Client_Payment: grossTotal });
        // Remember any edited rates for next time (points 5 & 6) — based on
        // each board's first document, same simplification as the rate
        // auto-suggest above.
        Boards.forEach((b) => {
          const firstDoc = b.Documents[0];
          if (!firstDoc) return;
          if (isConsultant && b.Vendor) api.upsertConsultantRate({ Consultant_Name: form.Client_Name, Board_Name: b.Board_Name, Rate: firstDoc.Client_Rate }).catch(() => {});
          if (b.Vendor) api.upsertServiceRate({ Vendor_Name: b.Vendor, Service_Name: b.Board_Name, Rate: firstDoc.Vendor_Rate }).catch(() => {});
        });
        toast.success(`Case added — ${Boards.length} board(s)`);
      } else {
        payload.Profit = profit;
        payload.Case_Mode = 'single';
        await api.addCase(payload);
        if (isConsultant && form.Client_Name && form.Service) {
          api.upsertConsultantRate({ Consultant_Name: form.Client_Name, Board_Name: form.Service, Rate: form.Client_Payment }).catch(() => {});
        } else if (form.Vendor && form.Service) {
          api.upsertServiceRate({ Vendor_Name: form.Vendor, Service_Name: form.Service, Rate: form.Vendor_Payment }).catch(() => {});
        }
        toast.success('Case added');
      }
      onSaved && onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={form.Date} onChange={(e) => set('Date', e.target.value)} required />
        </div>
        {!isMultiple && (
          <div>
            <label className="label">Document Status</label>
            <select className="input" value={form.Document_Status} onChange={(e) => set('Document_Status', e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Point 4: Walk-in or Consultant, asked up front */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Walk-in or Consultant?</label>
          <select className="input" value={form.Client_Type} onChange={(e) => { set('Client_Type', e.target.value); set('Client_Name', ''); set('Client_ID', ''); }} disabled={isEdit}>
            <option value="Walk-in">Walk-in</option>
            <option value="Consultant">Consultant</option>
          </select>
        </div>
        {!isEdit && (
          <div>
            <label className="label">Single Case or Multiple Boards?</label>
            <select className="input" value={form.Case_Mode} onChange={(e) => set('Case_Mode', e.target.value)}>
              <option value="single">Single</option>
              <option value="multiple">Multiple (IBCC / HEC / MOFA / Embassy…)</option>
            </select>
          </div>
        )}
      </div>

      {/* Point 5: Consultant list, or free-type walk-in client name */}
      {isConsultant ? (
        <div>
          <label className="label flex items-center justify-between">Consultant
            <button type="button" className="text-brand-600 text-xs font-medium" onClick={() => setNewClientOpen((v) => !v)}>+ New consultant</button>
          </label>
          <select className="input" value={form.Client_Name} onChange={(e) => pickClient(e.target.value)} required disabled={isEdit}>
            <option value="">Select consultant</option>
            {consultants.map((c) => <option key={c.Client_ID} value={c.Client_Name}>{c.Client_Name}</option>)}
          </select>
          {newClientOpen && (
            <InlineAdd placeholder="New consultant name" onCancel={() => setNewClientOpen(false)} onAdd={(v) => { setInlineName(v); addInline('client'); }} />
          )}
        </div>
      ) : (
        <div>
          <label className="label flex items-center justify-between">Client Name
            <button type="button" className="text-brand-600 text-xs font-medium" onClick={() => setNewClientOpen((v) => !v)}>+ New client</button>
          </label>
          <input list="client-list" className="input" value={form.Client_Name} onChange={(e) => pickClient(e.target.value)} placeholder="Type or select a client" required disabled={isEdit} />
          <datalist id="client-list">{clients.filter((c) => c.Client_Type !== 'Consultant').map((c) => <option key={c.Client_ID} value={c.Client_Name} />)}</datalist>
          {newClientOpen && (
            <InlineAdd placeholder="New client name" onCancel={() => setNewClientOpen(false)} onAdd={(v) => { setInlineName(v); addInline('client'); }} />
          )}
        </div>
      )}

      {isConsultant ? (
        <div>
          <label className="label">Company</label>
          <input className="input" value={form.Company} onChange={(e) => set('Company', e.target.value)} placeholder="Optional company name" />
        </div>
      ) : (
        <div>
          <label className="label">ID Card Number (CNIC)</label>
          <input className="input" value={form.ID_Card_Number || ''} onChange={(e) => set('ID_Card_Number', e.target.value)} placeholder="XXXXX-XXXXXXX-X" />
        </div>
      )}

      {/* --- SINGLE mode: point 8, works as before, simplified (no multi-step process UI) --- */}
      {!isMultiple && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center justify-between">Service
                <button type="button" className="text-brand-600 text-xs font-medium" onClick={() => setNewServiceOpen((v) => !v)}>+ New</button>
              </label>
              <select className="input" value={form.Service} onChange={(e) => set('Service', e.target.value)}>
                <option value="">Select service</option>
                {services.map((s) => <option key={s.Service_ID} value={s.Service_Name}>{s.Service_Name}</option>)}
              </select>
              {newServiceOpen && (
                <InlineAdd placeholder="New service name" onCancel={() => setNewServiceOpen(false)} onAdd={(v) => { setInlineName(v); addInline('service'); }} />
              )}
              {/* Point 5: Embassy sub-select when Service = Embassy Attestation */}
              {isEmbassyService && (
                <div className="mt-2 space-y-2">
                  <label className="label">Which Embassy?</label>
                  <select className="input" value={form.Embassy} onChange={(e) => set('Embassy', e.target.value)}>
                    <option value="">Select embassy</option>
                    {EMBASSY_OPTIONS.map((em) => <option key={em} value={em}>{em}</option>)}
                  </select>
                  {form.Embassy === 'Other' && (
                    <input className="input" placeholder="Type embassy name" value={form.Embassy_Other} onChange={(e) => set('Embassy_Other', e.target.value)} />
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="label">Document Type</label>
              <select className="input" value={form.Document_Type} onChange={(e) => set('Document_Type', e.target.value)}>
                <option value="">Select document type</option>
                {docTypes.map((dt) => <option key={dt.Type_ID} value={dt.Name}>{dt.Category} — {dt.Name}</option>)}
              </select>
              {/* Point 6: "Other" free text */}
              {form.Document_Type === 'Other' && (
                <input className="input mt-2" placeholder="Type the document name" value={form.Document_Type_Other} onChange={(e) => set('Document_Type_Other', e.target.value)} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {!isConsultant && (
              <div>
                <label className="label flex items-center justify-between">Vendor
                  <button type="button" className="text-brand-600 text-xs font-medium" onClick={() => setNewVendorOpen((v) => !v)}>+ New</button>
                </label>
                <select className="input" value={form.Vendor} onChange={(e) => set('Vendor', e.target.value)}>
                  <option value="">Select vendor</option>
                  {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
                </select>
                {newVendorOpen && (
                  <InlineAdd placeholder="New vendor name" onCancel={() => setNewVendorOpen(false)} onAdd={(v) => { setInlineName(v); addInline('vendor'); }} />
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label"># of Documents</label>
              <input type="number" min="0" className="input" value={form.No_of_Documents} onChange={(e) => set('No_of_Documents', e.target.value)} />
            </div>
            {!isConsultant && (
              <div>
                <label className="label">Vendor Payment {baseRate > 0 ? <span className="text-xs text-slate-400">(rate: {baseRate})</span> : null}</label>
                <input type="number" min="0" className="input" value={form.Vendor_Payment} onChange={(e) => set('Vendor_Payment', e.target.value)} />
              </div>
            )}
            <div>
              <label className="label">Client Payment {isConsultant && baseRate > 0 ? <span className="text-xs text-slate-400">(rate: {baseRate})</span> : null}</label>
              <input type="number" min="0" className="input" value={form.Client_Payment} onChange={(e) => set('Client_Payment', e.target.value)} />
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className="label">Special Rate Adjustment (+/-, on top of the auto-fetched rate)</label>
              <input type="number" className="input" value={form.Special_Rate_Adjustment} onChange={(e) => set('Special_Rate_Adjustment', e.target.value)} />
            </div>
          )}
        </>
      )}

      {/* Editing a multiple-board case: boards themselves are managed from
          "Change Status" on the Cases list (vendor/status/payments) — here
          we just show a clear read-only summary so Edit isn't a blank/odd
          screen, and this form only touches the shared fields below. */}
      {isEditingBoardsCase && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase">Boards on this case (use "Change Status" to edit)</div>
          {existingBoards.map((b, i) => (
            <div key={i} className="rounded bg-white border border-slate-100 px-2 py-1.5 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{b.board}</span>
                <span className="text-slate-500">{b.vendor || '—'}</span>
                <span className="text-xs text-slate-500">{b.status}</span>
              </div>
              {getBoardDocuments(b).map((d, di) => (
                <div key={di} className="text-xs text-slate-500 pl-2">
                  {d.documentType || '—'} — Vendor {Number(d.vendorRate) + Number(d.vendorAdjustment)} / Client {Number(d.clientRate) + Number(d.clientAdjustment)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* --- MULTIPLE mode: point 7/8/9, free-text board name + repeatable
          per-board documents, each with its own rates --- */}
      {isMultiple && !isEdit && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Boards / Documents to process</label>
            <button type="button" className="text-brand-600 text-xs font-medium" onClick={addBoardRow}>+ Add board</button>
          </div>
          <datalist id="board-types-list">{boardTypes.map((b) => <option key={b} value={b} />)}</datalist>

          {!boardRows.length && <p className="text-xs text-slate-400">No boards added yet — click "+ Add board" to start (e.g. IBCC, MOFA, Qatar Embassy…).</p>}

          {boardRows.map((row, bi) => (
            <div key={bi} className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="label">Board Name</label>
                  <input
                    className="input"
                    list="board-types-list"
                    placeholder="Type a board name (e.g. IBCC, Qatar Embassy)"
                    value={row.board}
                    onChange={(e) => setBoardRow(bi, { board: e.target.value })}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="label">Vendor for this board</label>
                    <select className="input" value={row.vendor} onChange={(e) => onBoardVendorChange(bi, e.target.value)}>
                      <option value="">Select vendor</option>
                      {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
                    </select>
                  </div>
                  <button type="button" className="btn-danger" onClick={() => removeBoardRow(bi)}>Remove Board</button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Documents in this board</div>
                  <button type="button" className="text-brand-600 text-xs font-medium" onClick={() => addDocument(bi)}>+ Add document</button>
                </div>
                {row.documents.map((doc, di) => (
                  <div key={di} className="rounded bg-white border border-slate-100 p-2 space-y-2">
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="label">Document Type</label>
                        <select className="input" value={doc.documentType} onChange={(e) => setDocument(bi, di, { documentType: e.target.value })}>
                          <option value="">Select document type</option>
                          {docTypes.map((dt) => <option key={dt.Type_ID} value={dt.Name}>{dt.Category} — {dt.Name}</option>)}
                        </select>
                        {/* Point 6: "Other" free text, per document */}
                        {doc.documentType === 'Other' && (
                          <input className="input mt-2" placeholder="Type the document name" value={doc.documentTypeOther} onChange={(e) => setDocument(bi, di, { documentTypeOther: e.target.value })} />
                        )}
                      </div>
                      {row.documents.length > 1 && (
                        <div className="text-right">
                          <button type="button" className="btn-ghost text-xs" onClick={() => removeDocument(bi, di)}>Remove document</button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="label">Vendor Rate</label>
                        <input type="number" className="input" value={doc.vendorRate} onChange={(e) => setDocument(bi, di, { vendorRate: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Vendor Adj (+/-)</label>
                        <input type="number" className="input" value={doc.vendorAdjustment} onChange={(e) => setDocument(bi, di, { vendorAdjustment: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Client Rate {isConsultant ? <span className="text-xs text-slate-400">(auto)</span> : ''}</label>
                        <input type="number" className="input" value={doc.clientRate} onChange={(e) => setDocument(bi, di, { clientRate: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Client Adj (+/-)</label>
                        <input type="number" className="input" value={doc.clientAdjustment} onChange={(e) => setDocument(bi, di, { clientAdjustment: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-400">Each board starts at status "Document Received" and is tracked independently — change its status/vendor later from the Cases list.</p>
        </div>
      )}

      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-medium text-emerald-800">Auto-calculated Profit</span>
        <span className="text-lg font-bold text-emerald-700">{profit.toLocaleString()}</span>
      </div>

      {!isEdit && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-blue-800">Advance Payment (optional)</div>
            <div className="text-sm text-blue-800">Total (Gross): <span className="font-bold">{grossTotal.toLocaleString()}</span></div>
          </div>
          <p className="text-xs text-blue-700">Has the client paid anything yet? Enter it here — otherwise the case will be marked Unpaid.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Advance Amount Received</label>
              <input type="number" min="0" className="input" value={form.Advance_Payment} onChange={(e) => set('Advance_Payment', e.target.value)} />
            </div>
            <div>
              <label className="label">Payment Method</label>
              <select className="input" value={form.Advance_Payment_Method} onChange={(e) => set('Advance_Payment_Method', e.target.value)}>
                {paymentMethods.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Expected Return Date</label>
          <input type="date" className="input" value={form.Expected_Return_Date} onChange={(e) => set('Expected_Return_Date', e.target.value)} />
        </div>
        <div>
          <label className="label">Actual Return Date</label>
          <input type="date" className="input" value={form.Actual_Return_Date} onChange={(e) => set('Actual_Return_Date', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={form.Notes} onChange={(e) => set('Notes', e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : isEdit ? 'Update Case' : 'Save Case'}</button>
      </div>
    </form>
  );
}

function InlineAdd({ placeholder, onAdd, onCancel }) {
  const [v, setV] = useState('');
  return (
    <div className="mt-2 flex gap-2">
      <input autoFocus className="input" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" className="btn-primary" onClick={() => onAdd(v)}>Add</button>
      <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
    </div>
  );
}
