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

function emptyDocument(documentType) {
  return { documentType: documentType || '', documentTypeOther: '', vendorRate: 0, vendorAdjustment: 0, clientRate: 0, clientAdjustment: 0 };
}

function emptyBoardRow() {
  // Phase 15: documents start empty — a board's documents are now TICKED
  // from the DocumentTypes checklist (see DocumentTickList) rather than
  // added one at a time via a free-typed "+ Add document" row.
  return { board: '', vendor: '', documents: [], isOther: false };
}

// Resolves a document-type checkbox value + its "Other" free text into the
// value actually saved (point 6): "Other" is never stored literally.
function resolveDocType(doc) {
  if (doc.documentType === 'Other') return (doc.documentTypeOther || '').trim() || 'Other';
  return doc.documentType || '';
}

// Backward-compatible reader for a single-mode case's documents — mirrors
// getCaseDocuments() in Code.gs (Phase 15). A single-mode case saved before
// this phase has no Documents_JSON at all; its document detail lives only
// in the legacy flat Document_Type/Vendor_Payment/Client_Payment fields —
// this always synthesizes a one-item array from those so every UI spot can
// treat both shapes the same way.
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

// Reusable tick-box document picker (Phase 15) — used both for a board's
// documents (multi-mode) and for a single-mode case's documents. Ticking a
// document type from the DocumentTypes list (which already includes an
// "Other" entry — same free-text pattern Phase 14 built) adds a rate row
// below the checklist; unticking removes it.
function DocumentTickList({ docTypes, documents, onToggle, onOtherText, onRateChange, embassyLabel }) {
  const otherDoc = documents.find((d) => d.documentType === 'Other');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded bg-white border border-slate-100 p-2 max-h-40 overflow-y-auto">
        {docTypes.map((dt) => {
          const checked = documents.some((d) => d.documentType === dt.Name);
          return (
            <label key={dt.Type_ID} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={checked} onChange={(e) => onToggle(dt.Name, e.target.checked)} />
              {dt.Category} — {dt.Name}
            </label>
          );
        })}
      </div>
      {otherDoc && (
        <input className="input" placeholder="Type the document name" value={otherDoc.documentTypeOther || ''} onChange={(e) => onOtherText(e.target.value)} />
      )}
      {!documents.length && <p className="text-xs text-slate-400">No documents ticked yet.</p>}
      {documents.map((d, di) => (
        <div key={di} className="rounded bg-slate-50 border border-slate-100 p-2 space-y-2">
          <div className="text-xs font-medium text-slate-600">
            {d.documentType === 'Other' ? (d.documentTypeOther || 'Other') : (d.documentType || '—')}{embassyLabel || ''}
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="label">Vendor Rate</label>
              <input type="number" className="input" value={d.vendorRate} onChange={(e) => onRateChange(di, { vendorRate: e.target.value })} />
            </div>
            <div>
              <label className="label">Vendor Adj (+/-)</label>
              <input type="number" className="input" value={d.vendorAdjustment} onChange={(e) => onRateChange(di, { vendorAdjustment: e.target.value })} />
            </div>
            <div>
              <label className="label">Client Rate</label>
              <input type="number" className="input" value={d.clientRate} onChange={(e) => onRateChange(di, { clientRate: e.target.value })} />
            </div>
            <div>
              <label className="label">Client Adj (+/-)</label>
              <input type="number" className="input" value={d.clientAdjustment} onChange={(e) => onRateChange(di, { clientAdjustment: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
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

  const [paymentMethods, setPaymentMethods] = useState(['Cash']);

  // --- "Multiple" (board) mode state (Phase 15) ---
  // Board is picked from the fixed BOARD_TYPES list via a TICK-BOX list
  // (checking IBCC + MOFA + Qatar Embassy in one go adds three board rows),
  // plus an "Other" checkbox revealing free text for a board not on the
  // list. Each ticked board can hold multiple TICKED documents, each with
  // its own rates (Phase 14's per-document rate row UI, unchanged).
  const [boardRows, setBoardRows] = useState([]);
  const [otherBoardName, setOtherBoardName] = useState('');
  const isEditingBoardsCase = isEdit && initial?.Case_Mode === 'multiple' && initial?.Boards_JSON;
  let existingBoards = [];
  try { existingBoards = isEditingBoardsCase ? JSON.parse(initial.Boards_JSON) : []; } catch { existingBoards = []; }

  // --- Single-mode documents (Phase 15) — a single-mode case can now also
  // hold multiple TICKED documents (same DocumentTypes checklist + Other),
  // each with its own rate row. Pre-filled from the case's existing
  // documents when editing (via getCaseDocuments(), which synthesizes one
  // item from the legacy flat fields for a pre-Phase-15 case).
  const [singleDocuments, setSingleDocuments] = useState(() => {
    if (isEdit && initial && initial.Case_Mode !== 'multiple') {
      return getCaseDocuments(initial).map((d) => ({
        documentType: d.documentType || '',
        documentTypeOther: '',
        vendorRate: Number(d.vendorRate) || 0,
        vendorAdjustment: Number(d.vendorAdjustment) || 0,
        clientRate: Number(d.clientRate) || 0,
        clientAdjustment: Number(d.clientAdjustment) || 0,
      }));
    }
    return [];
  });

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

  // --- Single mode (Phase 15): auto-fetch a rate PER TICKED DOCUMENT —
  // Consultant+DocumentType rate (Consultant) or DocumentType+Vendor rate
  // (Walk-in) — same idea as the per-board auto-suggest below, keyed by
  // document type instead of board name since a single-mode case no longer
  // has one flat rate.
  useEffect(() => {
    if (isEdit || isMultiple || !isConsultant || !form.Client_Name) return;
    singleDocuments.forEach((doc, idx) => {
      const key = doc.documentType === 'Other' ? (doc.documentTypeOther || '').trim() : doc.documentType;
      if (!key) return;
      api.getConsultantRates({ consultant: form.Client_Name, board: key }).then((rates) => {
        const r = rates && rates[0];
        if (r) setSingleDocument(idx, { clientRate: Number(r.Rate) });
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, isMultiple, isConsultant, form.Client_Name, singleDocuments.map((d) => d.documentType).join(',')]);

  useEffect(() => {
    if (isEdit || isMultiple || isConsultant || !form.Vendor) return;
    singleDocuments.forEach((doc, idx) => {
      const key = doc.documentType === 'Other' ? (doc.documentTypeOther || '').trim() : doc.documentType;
      if (!key) return;
      api.getServiceRates({ service: key, vendor: form.Vendor }).then((rates) => {
        const r = rates && rates[0];
        if (r) setSingleDocument(idx, { vendorRate: Number(r.Rate) });
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, isMultiple, isConsultant, form.Vendor, singleDocuments.map((d) => d.documentType).join(',')]);

  // Total (Gross) amount the client is being billed — shown next to the
  // Advance Payment box so staff can see the total while deciding the
  // advance amount, not just the Profit figure. Phase 15: single mode's
  // total is now the sum of every TICKED document's client rate, same idea
  // as multi-mode's board/document sum.
  const grossTotal = useMemo(() => {
    if (isMultiple) {
      return boardRows.reduce((s, row) => s + row.documents.reduce((s2, d) => s2 + (Number(d.clientRate) || 0) + (Number(d.clientAdjustment) || 0), 0), 0);
    }
    return singleDocuments.reduce((s, d) => s + (Number(d.clientRate) || 0) + (Number(d.clientAdjustment) || 0), 0);
  }, [isMultiple, boardRows, singleDocuments]);

  const singleVendorTotal = useMemo(() => (
    singleDocuments.reduce((s, d) => s + (Number(d.vendorRate) || 0) + (Number(d.vendorAdjustment) || 0), 0)
  ), [singleDocuments]);

  const profit = useMemo(() => {
    if (isMultiple) {
      const vp = boardRows.reduce((s, row) => s + row.documents.reduce((s2, d) => s2 + (Number(d.vendorRate) || 0) + (Number(d.vendorAdjustment) || 0), 0), 0);
      return grossTotal - vp;
    }
    return grossTotal - singleVendorTotal;
  }, [isMultiple, boardRows, grossTotal, singleVendorTotal]);

  function setBoardRow(idx, patch) {
    setBoardRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function setDocument(boardIdx, docIdx, patch) {
    setBoardRows((rows) => rows.map((r, i) => (
      i === boardIdx ? { ...r, documents: r.documents.map((d, di) => (di === docIdx ? { ...d, ...patch } : d)) } : r
    )));
  }

  // --- Board tick-box list (Phase 15): ticking a fixed BOARD_TYPES entry
  // adds a board row, unticking removes it. "Other" is a separate checkbox
  // (BOARD_TYPES has no literal "Other" entry) that reveals free text for a
  // board/service not on the fixed list.
  function toggleBoardType(name, checked) {
    setBoardRows((rows) => (
      checked ? [...rows, { ...emptyBoardRow(), board: name }]
        : rows.filter((r) => !(r.board === name && !r.isOther))
    ));
  }
  function toggleOtherBoard(checked) {
    if (checked) {
      setBoardRows((rows) => [...rows, { ...emptyBoardRow(), board: otherBoardName, isOther: true }]);
    } else {
      setBoardRows((rows) => rows.filter((r) => !r.isOther));
      setOtherBoardName('');
    }
  }
  function updateOtherBoardName(name) {
    setOtherBoardName(name);
    setBoardRows((rows) => rows.map((r) => (r.isOther ? { ...r, board: name } : r)));
  }

  // --- A board's document tick-box list (Phase 15): ticking a DocumentTypes
  // entry (which already includes "Other") adds a document row to that
  // board; unticking removes it.
  function toggleBoardDocument(boardIdx, name, checked) {
    setBoardRows((rows) => rows.map((r, i) => {
      if (i !== boardIdx) return r;
      if (checked) return { ...r, documents: [...r.documents, emptyDocument(name)] };
      return { ...r, documents: r.documents.filter((d) => d.documentType !== name) };
    }));
  }
  function setBoardOtherDocText(boardIdx, text) {
    setBoardRows((rows) => rows.map((r, i) => (
      i === boardIdx ? { ...r, documents: r.documents.map((d) => (d.documentType === 'Other' ? { ...d, documentTypeOther: text } : d)) } : r
    )));
  }

  // --- Single-mode document tick-box list (Phase 15) ---
  function toggleSingleDocument(name, checked) {
    setSingleDocuments((docs) => (
      checked ? [...docs, emptyDocument(name)] : docs.filter((d) => d.documentType !== name)
    ));
  }
  function setSingleDocument(idx, patch) {
    setSingleDocuments((docs) => docs.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function setSingleOtherDocText(text) {
    setSingleDocuments((docs) => docs.map((d) => (d.documentType === 'Other' ? { ...d, documentTypeOther: text } : d)));
  }

  // Resolves one single-mode ticked document's saved Document_Type: "Other"
  // free text (same pattern as resolveDocType) plus, when Service =
  // "Embassy Attestation", the chosen embassy appended per-document — e.g.
  // "PCC - Qatar Embassy". Implementation choice (Phase 15): the embassy
  // pick stays a single case-level control (Service is still one field per
  // case), but now that a single-mode case can have several documents, the
  // resulting embassy name is appended to EVERY ticked document instead of
  // one flat case-level Document_Type.
  function resolveSingleDocType(doc) {
    let base = resolveDocType(doc);
    if (isEmbassyService && form.Embassy) {
      const embassyName = form.Embassy === 'Other' ? ((form.Embassy_Other || '').trim() || 'Other') : form.Embassy;
      base = base ? `${base} - ${embassyName}` : `Embassy Attestation - ${embassyName}`;
    }
    return base;
  }
  const singleEmbassyLabel = isEmbassyService && form.Embassy
    ? ` — ${form.Embassy === 'Other' ? ((form.Embassy_Other || '').trim() || 'Other') : form.Embassy}`
    : '';

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

  // Builds the Documents payload for a single-mode case from every ticked
  // singleDocuments row — Code.gs sums these into Vendor_Payment/
  // Client_Payment and stores the array in Documents_JSON (Phase 15).
  function buildSingleDocumentsPayload() {
    return singleDocuments.map((d) => ({
      Document_Type: resolveSingleDocType(d),
      Vendor_Rate: Number(d.vendorRate) || 0,
      Vendor_Adjustment: Number(d.vendorAdjustment) || 0,
      Client_Rate: Number(d.clientRate) || 0,
      Client_Adjustment: Number(d.clientAdjustment) || 0,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.Client_Name) return toast.error('Client name is required');
    if (isMultiple && !boardRows.length) return toast.error('Tick at least one board');
    if (isMultiple && boardRows.some((r) => !r.board.trim())) return toast.error('Every board needs a name');
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, Added_By: initial?.Added_By || user?.fullName || '' };

      // Keep the client's own ID Card Number / Company in sync with what was
      // (re)typed on the case form, for an already-existing client.
      if (form.Client_ID && !isMultiple) {
        api.updateClient({ Client_ID: form.Client_ID, ID_Card_Number: form.ID_Card_Number, Company: form.Company }).catch(() => {});
      }

      if (isEdit) {
        payload.Profit = profit;
        if (!isMultiple) {
          payload.Documents = buildSingleDocumentsPayload();
          payload.Client_Payment = grossTotal;
          payload.Vendor_Payment = singleVendorTotal;
        }
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
        const Documents = buildSingleDocumentsPayload();
        payload.Profit = profit;
        payload.Case_Mode = 'single';
        payload.Documents = Documents;
        payload.Client_Payment = grossTotal;
        payload.Vendor_Payment = singleVendorTotal;
        await api.addCase(payload);
        // Remember any edited rates for next time, per ticked document —
        // same idea as the board rate-remembering above, keyed by document
        // type instead of board name.
        Documents.forEach((d) => {
          const key = d.Document_Type || form.Service;
          if (!key) return;
          if (isConsultant && form.Client_Name) api.upsertConsultantRate({ Consultant_Name: form.Client_Name, Board_Name: key, Rate: d.Client_Rate }).catch(() => {});
          else if (form.Vendor) api.upsertServiceRate({ Vendor_Name: form.Vendor, Service_Name: key, Rate: d.Vendor_Rate }).catch(() => {});
        });
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
            <div>
              <label className="label"># of Documents</label>
              <input type="number" min="0" className="input" value={form.No_of_Documents} onChange={(e) => set('No_of_Documents', e.target.value)} />
            </div>
          </div>

          {/* Phase 15: documents are ticked from the DocumentTypes checklist
              (+ Other) instead of a single flat dropdown — each ticked
              document gets its own Vendor/Client rate row below. */}
          <div>
            <label className="label">Documents (tick all that apply to this case)</label>
            <DocumentTickList
              docTypes={docTypes}
              documents={singleDocuments}
              onToggle={toggleSingleDocument}
              onOtherText={setSingleOtherDocText}
              onRateChange={setSingleDocument}
              embassyLabel={singleEmbassyLabel}
            />
          </div>
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

      {/* --- MULTIPLE mode (Phase 15): boards are TICKED from the fixed
          BOARD_TYPES list (+ Other) instead of typed one at a time; each
          ticked board's documents are, in turn, TICKED from the
          DocumentTypes list (+ Other), each with its own rate row. --- */}
      {isMultiple && !isEdit && (
        <div className="space-y-3">
          <label className="label mb-0">Boards / Services (tick all that apply)</label>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-50 border border-slate-100 p-3">
            {boardTypes.map((bt) => {
              const checked = boardRows.some((r) => r.board === bt && !r.isOther);
              return (
                <label key={bt} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={checked} onChange={(e) => toggleBoardType(bt, e.target.checked)} />
                  {bt}
                </label>
              );
            })}
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={boardRows.some((r) => r.isOther)} onChange={(e) => toggleOtherBoard(e.target.checked)} />
              Other
            </label>
          </div>
          {boardRows.some((r) => r.isOther) && (
            <input className="input" placeholder="Type a board/service name" value={otherBoardName} onChange={(e) => updateOtherBoardName(e.target.value)} />
          )}

          {!boardRows.length && <p className="text-xs text-slate-400">No boards ticked yet — tick one above to start (e.g. IBCC, MOFA, Qatar Embassy…).</p>}

          {boardRows.map((row, bi) => (
            <div key={bi} className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm">{row.board || '(untitled board)'}</div>
                <div className="flex-1 max-w-xs">
                  <select className="input" value={row.vendor} onChange={(e) => onBoardVendorChange(bi, e.target.value)}>
                    <option value="">Select vendor for this board</option>
                    {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500 uppercase">Documents in this board (tick all that apply)</div>
                <DocumentTickList
                  docTypes={docTypes}
                  documents={row.documents}
                  onToggle={(name, checked) => toggleBoardDocument(bi, name, checked)}
                  onOtherText={(text) => setBoardOtherDocText(bi, text)}
                  onRateChange={(di, patch) => setDocument(bi, di, patch)}
                />
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
