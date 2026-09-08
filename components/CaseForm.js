'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import { downloadBase64File } from '../lib/utils';

const STATUS_OPTIONS = ['New', 'Documents Received', 'Processing', 'Sent to Vendor', 'Pending', 'Completed', 'Returned to Client', 'Cancelled'];
const EMBASSY_OPTIONS = ['Qatar Embassy', 'Saudi Embassy', 'UAE Embassy', 'Kuwait Embassy', 'Bahrain Embassy', 'Oman Embassy', 'Other'];
// PHASE 19 — a per-document status list, same set the Cases list's "Change
// Status" panel already uses (BOARD_STATUS_OPTIONS there) — kept as its own
// copy here since that file doesn't export it.
const DOC_STATUS_OPTIONS = ['Document Received', 'Sent to Vendor', 'Hold', 'Return with Payment', 'Return without Payment', 'Delivered with Payment', 'Delivered without Payment'];

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

// Backward-compatible reader for a case's services — mirrors
// getCaseServices() in Code.gs (Phase 16, Part A). Used only for the
// read-only "editing a services-mode case" summary below; the live add-case
// flow builds serviceRows state directly, it doesn't need this.
function getCaseServicesJS(c) {
  if (!c) return [];
  if (c.Services_JSON) {
    try {
      const parsed = JSON.parse(c.Services_JSON);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* fall through */ }
  }
  return [];
}

// Reusable tick-box document picker (Phase 15) — used both for a board's
// documents (multi-mode) and for a single-mode case's documents. Ticking a
// document type from the DocumentTypes list (which already includes an
// "Other" entry — same free-text pattern Phase 14 built) adds a rate row
// below the checklist; unticking removes it.
function DocumentTickList({ docTypes, documents, onToggle, onAddOther, onRemove, onRateChange, embassyLabel }) {
  // PHASE 18 (follow-up) — "Other" used to be one shared checkbox/textbox
  // pair, so only ONE custom document could ever be added at a time (ticking
  // it again did nothing new to tick). It's now its own "+ Add" button that
  // always appends a brand-new blank custom-document row, each with its own
  // name text box and its own remove button — any number of distinct custom
  // documents can be added this way.
  const namedDocTypes = docTypes.filter((dt) => dt.Name !== 'Other');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded bg-white border border-slate-100 p-2 max-h-40 overflow-y-auto">
        {namedDocTypes.map((dt) => {
          const checked = documents.some((d) => d.documentType === dt.Name);
          return (
            <label key={dt.Type_ID} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={checked} onChange={(e) => onToggle(dt.Name, e.target.checked)} />
              {dt.Category} — {dt.Name}
            </label>
          );
        })}
      </div>
      <button type="button" className="text-xs text-brand-600 font-medium" onClick={onAddOther}>+ Add another document (Other / not in the list)</button>
      {!documents.length && <p className="text-xs text-slate-400">No documents ticked yet.</p>}
      {documents.map((d, di) => (
        <div key={di} className="rounded bg-slate-50 border border-slate-100 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-600">
              {d.documentType === 'Other' ? 'Other (custom document)' : (d.documentType || '—')}{embassyLabel || ''}
            </div>
            {d.documentType === 'Other' && (
              <button type="button" className="text-xs text-red-500" onClick={() => onRemove(di)}>✕ Remove</button>
            )}
          </div>
          {d.documentType === 'Other' && (
            <input className="input" placeholder="Type the document name" value={d.documentTypeOther || ''} onChange={(e) => onRateChange(di, { documentTypeOther: e.target.value })} />
          )}
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

// PHASE 16 (Part A) — a service's tick-box document picker. Like
// DocumentTickList, but each ticked document ALSO gets its own Vendor
// picker (a document, even within the same service, can go to a different
// vendor and be tracked independently — the confirmed core requirement of
// this phase), on top of its own four rate fields.
function ServiceDocumentTickList({ docTypes, documents, vendors, onToggle, onAddOther, onRemove, onFieldChange }) {
  // PHASE 18 (follow-up) — see DocumentTickList above for why: "Other" is now
  // a "+ Add" button that appends a fresh custom-document row every click,
  // each with its own independent name box and remove button, instead of one
  // shared checkbox+textbox that only ever tracked a single custom document.
  const namedDocTypes = docTypes.filter((dt) => dt.Name !== 'Other');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded bg-white border border-slate-100 p-2 max-h-40 overflow-y-auto">
        {namedDocTypes.map((dt) => {
          const checked = documents.some((d) => d.documentType === dt.Name);
          return (
            <label key={dt.Type_ID} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={checked} onChange={(e) => onToggle(dt.Name, e.target.checked)} />
              {dt.Category} — {dt.Name}
            </label>
          );
        })}
      </div>
      <button type="button" className="text-xs text-brand-600 font-medium" onClick={onAddOther}>+ Add another document (Other / not in the list)</button>
      {!documents.length && <p className="text-xs text-slate-400">No documents ticked yet.</p>}
      {documents.map((d, di) => (
        <div key={di} className="rounded bg-slate-50 border border-slate-100 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-600">
              {d.documentType === 'Other' ? 'Other (custom document)' : (d.documentType || '—')}
            </div>
            <div className="flex items-center gap-2">
              {d.documentType === 'Other' && (
                <button type="button" className="text-xs text-red-500" onClick={() => onRemove(di)}>✕ Remove</button>
              )}
              <select className="input !py-1 !text-xs max-w-[10rem]" value={d.vendor} onChange={(e) => onFieldChange(di, { vendor: e.target.value })}>
                <option value="">This document's vendor</option>
                {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
              </select>
            </div>
          </div>
          {d.documentType === 'Other' && (
            <input className="input" placeholder="Type the document name" value={d.documentTypeOther || ''} onChange={(e) => onFieldChange(di, { documentTypeOther: e.target.value })} />
          )}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="label">Vendor Rate</label>
              <input type="number" className="input" value={d.vendorRate} onChange={(e) => onFieldChange(di, { vendorRate: e.target.value })} />
            </div>
            <div>
              <label className="label">Vendor Adj (+/-)</label>
              <input type="number" className="input" value={d.vendorAdjustment} onChange={(e) => onFieldChange(di, { vendorAdjustment: e.target.value })} />
            </div>
            <div>
              <label className="label">Client Rate</label>
              <input type="number" className="input" value={d.clientRate} onChange={(e) => onFieldChange(di, { clientRate: e.target.value })} />
            </div>
            <div>
              <label className="label">Client Adj (+/-)</label>
              <input type="number" className="input" value={d.clientAdjustment} onChange={(e) => onFieldChange(di, { clientAdjustment: e.target.value })} />
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
    Phone: '',
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
    // PHASE 17: the actual end-client's own details, captured separately
    // from the CONSULTANT selected above (Client_Name/Client_ID keep
    // referring to the consultant — the existing consultant-rate
    // auto-suggest depends on that) — only used/required when
    // Client_Type === 'Consultant' on a brand-new case.
    End_Client_Name: '',
    End_Client_Phone: '',
    End_Client_ID_Card: '',
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

  // --- PHASE 16 (Part A): the new-case flow — a tick-box list of SERVICES
  // (Board Verification, IBCC, HEC, MOFA, embassies, National Police
  // Bureau, plus "Other" free text), each holding one or more TICKED
  // documents (filtered by DEFAULT_SERVICE_DOCTYPE_MAP), each document
  // carrying its OWN vendor/status/rates — the confirmed core requirement
  // that a document, even within the same service, can go to a different
  // vendor and be tracked independently. This is the ONLY way a brand-new
  // case is created from now on; editing an existing legacy case still uses
  // the single-mode / multiple-mode paths below unchanged.
  const [serviceRows, setServiceRows] = useState([]);
  const [otherServiceName, setOtherServiceName] = useState('');
  const [serviceDocTypeMap, setServiceDocTypeMap] = useState({});
  const [savedCase, setSavedCase] = useState(null); // set once a NEW case has saved — shows "Save Only" / "Save & Download PDF"
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const isServicesCase = isEdit && initial?.Case_Mode === 'services' && initial?.Services_JSON;
  const existingServices = isServicesCase ? getCaseServicesJS(initial) : [];
  // PHASE 19 — editing a services-mode case now fully opens the case:
  // every document's Vendor/Client rate, vendor, and status is editable
  // right here, documents can be added or removed, and it all saves
  // together in one shot when "Update Case" is pressed (same as every
  // other field on this form) — no more "go to the Cases list to edit"
  // detour. Seeded once from the case's existing services on open; edits
  // only touch this local copy until submit.
  const [editServices, setEditServices] = useState(() => JSON.parse(JSON.stringify(existingServices)));

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [inlineName, setInlineName] = useState('');

  useEffect(() => {
    Promise.all([api.getClients(), api.getVendors(), api.getServices(), api.getDocumentTypes(), api.getBoardTypes()])
      .then(([c, v, s, dt, bt]) => {
        setClients(c); setVendors(v); setServices(s); setDocTypes(dt); setBoardTypes(bt.boards || []);
        if (bt.paymentMethods?.length) setPaymentMethods(bt.paymentMethods);
        if (bt.serviceDocTypeMap) setServiceDocTypeMap(bt.serviceDocTypeMap);
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
      set('Phone', c.Phone || form.Phone);
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

  // PHASE 16 (Part A) totals — declared here, BEFORE grossTotal/profit below
  // reference them, since `const` bindings are not usable before their own
  // declaration runs (a bug: these used to be declared further down the
  // file, which threw "Cannot access before initialization" and crashed the
  // whole form — New Case / Quick Add — the moment CaseForm rendered).
  const servicesGrossTotal = useMemo(() => (
    serviceRows.reduce((s, r) => s + r.documents.reduce((s2, d) => s2 + (Number(d.clientRate) || 0) + (Number(d.clientAdjustment) || 0), 0), 0)
  ), [serviceRows]);
  const servicesVendorTotal = useMemo(() => (
    serviceRows.reduce((s, r) => s + r.documents.reduce((s2, d) => s2 + (Number(d.vendorRate) || 0) + (Number(d.vendorAdjustment) || 0), 0), 0)
  ), [serviceRows]);

  // Total (Gross) amount the client is being billed — shown next to the
  // Advance Payment box so staff can see the total while deciding the
  // advance amount, not just the Profit figure. Phase 15: single mode's
  // total is now the sum of every TICKED document's client rate, same idea
  // as multi-mode's board/document sum.
  const grossTotal = useMemo(() => {
    if (!isEdit) return servicesGrossTotal;
    if (isMultiple) {
      return boardRows.reduce((s, row) => s + row.documents.reduce((s2, d) => s2 + (Number(d.clientRate) || 0) + (Number(d.clientAdjustment) || 0), 0), 0);
    }
    return singleDocuments.reduce((s, d) => s + (Number(d.clientRate) || 0) + (Number(d.clientAdjustment) || 0), 0);
  }, [isEdit, isMultiple, boardRows, singleDocuments, servicesGrossTotal]);

  const singleVendorTotal = useMemo(() => (
    singleDocuments.reduce((s, d) => s + (Number(d.vendorRate) || 0) + (Number(d.vendorAdjustment) || 0), 0)
  ), [singleDocuments]);

  // PHASE 19 — while editing an existing services-mode case, the totals
  // shown below need to track the live `editServices` copy (rates can now
  // change, documents can be added/removed right here), not the frozen
  // snapshot the case originally loaded with.
  const editServicesGrossTotal = useMemo(() => (
    editServices.reduce((s, sv) => s + (sv.documents || []).reduce((s2, d) => s2 + (Number(d.clientRate) || 0) + (Number(d.clientAdjustment) || 0), 0), 0)
  ), [editServices]);
  const editServicesVendorTotal = useMemo(() => (
    editServices.reduce((s, sv) => s + (sv.documents || []).reduce((s2, d) => s2 + (Number(d.vendorRate) || 0) + (Number(d.vendorAdjustment) || 0), 0), 0)
  ), [editServices]);

  const profit = useMemo(() => {
    if (!isEdit) return servicesGrossTotal - servicesVendorTotal;
    if (isServicesCase) return editServicesGrossTotal - editServicesVendorTotal;
    if (isMultiple) {
      const vp = boardRows.reduce((s, row) => s + row.documents.reduce((s2, d) => s2 + (Number(d.vendorRate) || 0) + (Number(d.vendorAdjustment) || 0), 0), 0);
      return grossTotal - vp;
    }
    return grossTotal - singleVendorTotal;
  }, [isEdit, isServicesCase, isMultiple, boardRows, grossTotal, singleVendorTotal, servicesGrossTotal, servicesVendorTotal, editServicesGrossTotal, editServicesVendorTotal]);

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
  // PHASE 18 (follow-up): "Other" is no longer one shared toggle — Add always
  // appends a fresh blank custom-document row (so a second, third, etc.
  // custom document can be added), and Remove deletes one specific row by
  // index (each row's own name box is wired directly via onRateChange).
  function addBoardOtherDocument(boardIdx) {
    setBoardRows((rows) => rows.map((r, i) => (i === boardIdx ? { ...r, documents: [...r.documents, emptyDocument('Other')] } : r)));
  }
  function removeBoardDocument(boardIdx, di) {
    setBoardRows((rows) => rows.map((r, i) => (i === boardIdx ? { ...r, documents: r.documents.filter((_, j) => j !== di) } : r)));
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
  function addSingleOtherDocument() {
    setSingleDocuments((docs) => [...docs, emptyDocument('Other')]);
  }
  function removeSingleDocument(di) {
    setSingleDocuments((docs) => docs.filter((_, j) => j !== di));
  }

  // --- PHASE 16 (Part A) service tick-box list ---
  function toggleServiceType(name, checked) {
    setServiceRows((rows) => (
      checked ? [...rows, { service: name, isOther: false, urgency: name === 'IBCC' ? 'Normal' : null, documents: [] }]
        : rows.filter((r) => !(r.service === name && !r.isOther))
    ));
  }
  function toggleOtherService(checked) {
    if (checked) {
      setServiceRows((rows) => [...rows, { service: otherServiceName, isOther: true, urgency: null, documents: [] }]);
    } else {
      setServiceRows((rows) => rows.filter((r) => !r.isOther));
      setOtherServiceName('');
    }
  }
  function updateOtherServiceName(name) {
    setOtherServiceName(name);
    setServiceRows((rows) => rows.map((r) => (r.isOther ? { ...r, service: name } : r)));
  }
  function setServiceUrgency(si, urgency) {
    setServiceRows((rows) => rows.map((r, i) => (i === si ? { ...r, urgency } : r)));
  }
  // A ticked service's document list is filtered by
  // DEFAULT_SERVICE_DOCTYPE_MAP (fetched from the backend) — e.g. IBCC only
  // offers Matric/Inter papers, HEC only Bachelor's-onward, everything else
  // (MOFA, Apostille, any Embassy, National Police Bureau, Board
  // Verification) accepts any document type. "Other" is always offered too,
  // same free-text pattern the rest of the app already uses.
  function allowedDocTypesForService(serviceName) {
    const mapping = serviceDocTypeMap[serviceName];
    if (!mapping || mapping.includes('*')) return docTypes;
    return docTypes.filter((dt) => mapping.includes(dt.Name) || dt.Name === 'Other');
  }
  // PHASE 16 (Part B): when a document is freshly ticked, auto-suggest its
  // Client Rate — from the consultant's own remembered rate (ConsultantRates,
  // same idea as the legacy single-mode auto-suggest above) when this case
  // is for a Consultant, otherwise from the new client-side standard rate
  // table (ClientRates: "Client ki service charges... auto pe utha lo"),
  // keyed by Service + Document Type. Staff can still edit the field freely
  // afterwards — this only pre-fills it once, at tick time.
  function toggleServiceDocument(si, name, checked) {
    setServiceRows((rows) => rows.map((r, i) => {
      if (i !== si) return r;
      if (checked) return { ...r, documents: [...r.documents, emptyDocument(name)] };
      return { ...r, documents: r.documents.filter((d) => d.documentType !== name) };
    }));
    if (!checked) return;
    const serviceName = serviceRows[si]?.service;
    if (!serviceName || name === 'Other') return; // "Other" has no fixed name yet to look a rate up by
    function applyClientRate(rate) {
      setServiceRows((rows) => rows.map((row, i) => (
        i === si ? { ...row, documents: row.documents.map((d) => (d.documentType === name ? { ...d, clientRate: rate } : d)) } : row
      )));
    }
    if (isConsultant && form.Client_Name) {
      api.getConsultantRates({ consultant: form.Client_Name, board: serviceName, documentType: name }).then((rates) => {
        const r = rates && rates[0];
        if (r) applyClientRate(Number(r.Rate));
      }).catch(() => {});
    } else {
      api.getClientRates({ service: serviceName, documentType: name }).then((rates) => {
        const r = rates && rates[0];
        if (r) applyClientRate(Number(r.Client_Rate));
      }).catch(() => {});
    }
  }
  function addServiceOtherDocument(si) {
    setServiceRows((rows) => rows.map((r, i) => (i === si ? { ...r, documents: [...r.documents, emptyDocument('Other')] } : r)));
  }
  function removeServiceDocument(si, di) {
    setServiceRows((rows) => rows.map((r, i) => (i === si ? { ...r, documents: r.documents.filter((_, j) => j !== di) } : r)));
  }
  // PHASE 16 (Part B): when a specific document's Vendor is picked (or
  // changed), auto-suggest that vendor's rate for this exact Service +
  // Document Type pair (ServiceRates is now keyed at that granularity — e.g.
  // "Ejaz: IBCC Matric" vs "Ejaz: IBCC Inter" are separate rates, no longer
  // one blended IBCC rate). Only applies when the document already has a
  // resolved type (a bare "Other" with no free text yet has nothing to key
  // the lookup by).
  function setServiceDocumentField(si, di, patch) {
    setServiceRows((rows) => rows.map((r, i) => (
      i === si ? { ...r, documents: r.documents.map((d, j) => (j === di ? { ...d, ...patch } : d)) } : r
    )));
    if (patch.vendor !== undefined && patch.vendor) {
      const row = serviceRows[si];
      const doc = row?.documents[di];
      const docTypeName = doc ? resolveDocType(doc) : '';
      if (row?.service && docTypeName) {
        api.getServiceRates({ service: row.service, vendor: patch.vendor, documentType: docTypeName }).then((rates) => {
          const r = rates && rates[0];
          if (r) {
            setServiceRows((rows2) => rows2.map((rr, i2) => (
              i2 === si ? { ...rr, documents: rr.documents.map((d2, j2) => (j2 === di ? { ...d2, vendorRate: Number(r.Rate) } : d2)) } : rr
            )));
          }
        }).catch(() => {});
      }
    }
  }

  // PHASE 19 — helpers for the now-editable "Services on this case" block
  // (editing an EXISTING services-mode case). All three only touch the
  // local `editServices` copy; nothing reaches the backend until "Update
  // Case" is pressed.
  function editExistingDoc(si, di, patch) {
    setEditServices((svcs) => svcs.map((sv, i) => (
      i === si ? { ...sv, documents: sv.documents.map((d, j) => (j === di ? { ...d, ...patch } : d)) } : sv
    )));
  }
  function addExistingDoc(si) {
    setEditServices((svcs) => svcs.map((sv, i) => (
      i === si ? { ...sv, documents: [...sv.documents, { docId: 'new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), documentType: '', vendor: '', vendorRate: 0, vendorAdjustment: 0, clientRate: 0, clientAdjustment: 0, status: 'Document Received', sentDate: '', receivedDate: '', vendorPaid: 0, notes: '' }] } : sv
    )));
  }
  // Confirms before removing when the document already has vendor payment
  // recorded, or has moved past its starting status — a plain unused/just-
  // added document is removed straight away.
  function removeExistingDoc(si, di) {
    const doc = editServices[si]?.documents[di];
    if (!doc) return;
    const hasHistory = Number(doc.vendorPaid) > 0 || (doc.status && doc.status !== 'Document Received');
    const label = doc.documentType === 'Other' ? (doc.documentTypeOther || 'Other') : (doc.documentType || 'this document');
    if (hasHistory) {
      const ok = window.confirm(`"${label}" already has progress recorded (status: ${doc.status}${Number(doc.vendorPaid) > 0 ? `, vendor paid: ${doc.vendorPaid}` : ''}). Delete it anyway? This can't be undone.`);
      if (!ok) return;
    }
    setEditServices((svcs) => svcs.map((sv, i) => (
      i === si ? { ...sv, documents: sv.documents.filter((_, j) => j !== di) } : sv
    )));
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

  // Required-field validation before submit (confirmed general fix, applied
  // here for the rebuilt intake form): Client Name, Client Mobile Number, at
  // least one service ticked with at least one document ticked under it,
  // Date Received, Expected Return Date. Blocks submission with a clear
  // inline error (toast) instead of silently saving an incomplete case.
  function validateNewCase() {
    if (!form.Client_Name) return isConsultant ? 'Consultant is required' : 'Client name is required';
    if (!isConsultant && !form.Phone) return 'Client mobile number is required';
    if (!form.Date) return 'Date received is required';
    if (!form.Expected_Return_Date) return 'Expected return date is required';
    if (!serviceRows.length) return 'Tick at least one service';
    if (serviceRows.some((r) => !r.service.trim())) return 'Every service needs a name';
    if (!serviceRows.some((r) => r.documents.length)) return 'Tick at least one document under a service';
    // PHASE 17: filing a case through a Consultant also requires the actual
    // end-client's own Name/Mobile/ID Card — the consultant fields above
    // only identify WHICH consultant, not whose documents these are.
    if (isConsultant) {
      if (!form.End_Client_Name) return "End client's name is required";
      if (!form.End_Client_Phone) return "End client's mobile number is required";
      if (!form.End_Client_ID_Card) return "End client's ID Card Number (CNIC) is required";
    }
    return '';
  }

  async function submit(e) {
    e.preventDefault();
    if (!isEdit) {
      const err = validateNewCase();
      if (err) return toast.error(err);
    } else {
      if (!form.Client_Name) return toast.error('Client name is required');
      if (isMultiple && !boardRows.length) return toast.error('Tick at least one board');
      if (isMultiple && boardRows.some((r) => !r.board.trim())) return toast.error('Every board needs a name');
      // PHASE 19: a freshly "+ Add"-ed document needs its type picked (and,
      // if Other, its name typed) before it can be saved — same rule new-
      // case intake already enforces.
      if (isServicesCase && editServices.some((sv) => (sv.documents || []).some((d) => !resolveDocType(d)))) {
        return toast.error('Every document needs a type selected (or a name typed for "Other")');
      }
    }
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, Added_By: initial?.Added_By || user?.fullName || '' };

      // Keep the client's own ID Card Number / Company / Phone in sync with
      // what was (re)typed on the case form, for an already-existing client.
      if (form.Client_ID && !isMultiple) {
        api.updateClient({ Client_ID: form.Client_ID, ID_Card_Number: form.ID_Card_Number, Company: form.Company, Phone: form.Phone }).catch(() => {});
      }

      if (!isEdit) {
        // PHASE 16 (Part A): every new case is created in the "services"
        // model — one entry per ticked service, each with its own ticked
        // documents, each document carrying its own vendor/rates. This is
        // the ONLY case-creation path from now on; Boards_JSON/
        // Documents_JSON are never written for new cases.
        const Services = serviceRows.map((r) => ({
          Service: r.service.trim(),
          Urgency: r.service === 'IBCC' ? (r.urgency || 'Normal') : null,
          Documents: r.documents.map((d) => ({
            Document_Type: resolveDocType(d),
            Vendor: d.vendor || '',
            Vendor_Rate: Number(d.vendorRate) || 0,
            Vendor_Adjustment: Number(d.vendorAdjustment) || 0,
            Client_Rate: Number(d.clientRate) || 0,
            Client_Adjustment: Number(d.clientAdjustment) || 0,
          })),
        }));
        payload.Profit = servicesGrossTotal - servicesVendorTotal;
        const saved = await api.addCase({ ...payload, Case_Mode: 'services', Services, Client_Payment: servicesGrossTotal, Vendor_Payment: servicesVendorTotal });
        // Remember any edited rates for next time, per ticked document —
        // same idea as the legacy per-board/per-document rate-remembering.
        Services.forEach((sv) => {
          sv.Documents.forEach((d) => {
            const key = d.Document_Type || sv.Service;
            if (!key) return;
            if (isConsultant && form.Client_Name) api.upsertConsultantRate({ Consultant_Name: form.Client_Name, Board_Name: key, Rate: d.Client_Rate }).catch(() => {});
            else if (d.Vendor) api.upsertServiceRate({ Vendor_Name: d.Vendor, Service_Name: key, Rate: d.Vendor_Rate }).catch(() => {});
          });
        });
        toast.success(`Case ${saved.Case_ID} saved — ${Services.length} service(s)`);
        setSavedCase(saved);
        setSaving(false);
        return;
      }

      if (isEdit) {
        payload.Profit = profit;
        if (!isMultiple && !isServicesCase) {
          payload.Documents = buildSingleDocumentsPayload();
          payload.Client_Payment = grossTotal;
          payload.Vendor_Payment = singleVendorTotal;
        }
        // PHASE 19 — a services-mode case's documents/rates/vendor/status
        // are now edited right here (editServices, built up from the tick-
        // list above) and sent along in the same updateCase call, in the
        // same {Service, Urgency, Documents:[...]} shape addCase already
        // uses — updateCase already knows how to rebuild Services_JSON and
        // every rollup from that shape, preserving each document's existing
        // docId (and so its in-flight status/vendor history) wherever one
        // is echoed back; only a brand-new "+ Add a document" row (docId
        // starting "new_") gets a fresh one server-side.
        if (isServicesCase) {
          payload.Services = editServices.map((sv) => ({
            Service_Id: sv.serviceId,
            Service: sv.service,
            Urgency: sv.urgency,
            Documents: (sv.documents || []).map((d) => ({
              docId: d.docId && !d.docId.startsWith('new_') ? d.docId : undefined,
              Document_Type: resolveDocType(d),
              Vendor: d.vendor || '',
              Vendor_Rate: Number(d.vendorRate) || 0,
              Vendor_Adjustment: Number(d.vendorAdjustment) || 0,
              Client_Rate: Number(d.clientRate) || 0,
              Client_Adjustment: Number(d.clientAdjustment) || 0,
              status: d.status || 'Document Received',
              sentDate: d.sentDate || '',
              receivedDate: d.receivedDate || '',
              vendorPaid: Number(d.vendorPaid) || 0,
              notes: d.notes || '',
            })),
          }));
        }
        await api.updateCase({ ...payload, Case_ID: initial.Case_ID });
        toast.success('Case updated');
      }
      // (New-case creation always returns early above, in the services
      // branch — this point is only reached when editing.)
      onSaved && onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  // PHASE 16 (Part A): after a brand-new case saves, offer an explicit
  // choice instead of just closing — "Save Only" (current behavior) or
  // "Save & Download PDF" (a receipt, via the same PDF mechanism the
  // invoice system already uses).
  async function downloadReceipt() {
    setDownloadingReceipt(true);
    try {
      const r = await api.getReceiptPdf(savedCase.Case_ID);
      downloadBase64File(r.filename, r.base64, 'application/pdf');
    } catch (e) { toast.error(e.message); } finally {
      setDownloadingReceipt(false);
      onSaved && onSaved();
    }
  }

  if (savedCase) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-1">
          <div className="text-sm font-semibold text-emerald-800">Case {savedCase.Case_ID} saved.</div>
          <p className="text-xs text-emerald-700">Save the receipt now, or just close — you can print a receipt/invoice anytime from the Cases list.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => onSaved && onSaved()}>Save Only</button>
          <button type="button" disabled={downloadingReceipt} className="btn-primary" onClick={downloadReceipt}>{downloadingReceipt ? 'Preparing…' : 'Save & Download PDF'}</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Date Received</label>
          <input type="date" className="input" value={form.Date} onChange={(e) => set('Date', e.target.value)} required />
        </div>
        {!isMultiple && isEdit && !isServicesCase && (
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
        <div>
          <label className="label">{isConsultant ? "Consultant's Contact Number (optional)" : 'Client Mobile Number'}</label>
          <input className="input" value={form.Phone || ''} onChange={(e) => set('Phone', e.target.value)} placeholder="03xx-xxxxxxx" required={!isEdit && !isConsultant} />
        </div>
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
      ) : null}

      {/* PHASE 17: filing a case through a Consultant still needs the actual
          end-client's own details — the consultant picked above is only WHO
          is submitting the case, not whose documents they are. Required,
          same as the Walk-in path's own Name/Phone/ID Card fields, and kept
          fully separate from form.Client_Name/Client_ID (those must keep
          referring to the CONSULTANT — the consultant-rate auto-suggest
          above depends on it). Shown only for a brand-new case. */}
      {!isEdit && isConsultant && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase">End Client Details (whose documents these are)</div>
          <div>
            <label className="label">Client Name</label>
            <input className="input" value={form.End_Client_Name} onChange={(e) => set('End_Client_Name', e.target.value)} placeholder="Full name of the person whose documents these are" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client Mobile Number</label>
              <input className="input" value={form.End_Client_Phone} onChange={(e) => set('End_Client_Phone', e.target.value)} placeholder="03xx-xxxxxxx" required />
            </div>
            <div>
              <label className="label">ID Card Number (CNIC)</label>
              <input className="input" value={form.End_Client_ID_Card} onChange={(e) => set('End_Client_ID_Card', e.target.value)} placeholder="XXXXX-XXXXXXX-X" required />
            </div>
          </div>
        </div>
      )}

      {!isConsultant && (
        <div>
          <label className="label">ID Card Number (CNIC)</label>
          <input className="input" value={form.ID_Card_Number || ''} onChange={(e) => set('ID_Card_Number', e.target.value)} placeholder="XXXXX-XXXXXXX-X" />
        </div>
      )}

      {/* --- Legacy SINGLE-mode case, editing only: works as before --- */}
      {!isMultiple && isEdit && !isServicesCase && (
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
              onAddOther={addSingleOtherDocument}
              onRemove={removeSingleDocument}
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

      {/* PHASE 19 — editing a services-mode case now fully opens up: every
          document's Vendor, Vendor Rate, Client Rate (both + their
          adjustments) and Status can be changed right here, a document can
          be removed (with a confirm if it already has progress/payment on
          it) or added, and it's all saved together with the rest of the
          form when "Update Case" is pressed. */}
      {isServicesCase && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase">Services on this case (edit rates, vendor, status — add or remove documents)</div>
          {editServices.map((sv, si) => (
            <div key={sv.serviceId} className="rounded bg-white border border-slate-100 p-2 space-y-2">
              <div className="font-medium text-sm">{sv.service}{sv.urgency ? ` (${sv.urgency})` : ''}</div>
              {(sv.documents || []).map((d, di) => (
                <div key={d.docId} className="rounded bg-slate-50 border border-slate-100 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {d.docId.startsWith('new_') ? (
                      <select className="input !py-1 !text-xs max-w-[14rem]" value={d.documentType === 'Other' ? 'Other' : d.documentType} onChange={(e) => editExistingDoc(si, di, { documentType: e.target.value, documentTypeOther: '' })}>
                        <option value="">Select document type</option>
                        {allowedDocTypesForService(sv.service).map((dt) => <option key={dt.Type_ID} value={dt.Name}>{dt.Category} — {dt.Name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-slate-600">{d.documentType || '—'}</span>
                    )}
                    <button type="button" className="text-xs text-red-500" onClick={() => removeExistingDoc(si, di)}>✕ Remove</button>
                  </div>
                  {d.docId.startsWith('new_') && d.documentType === 'Other' && (
                    <input className="input" placeholder="Type the document name" value={d.documentTypeOther || ''} onChange={(e) => editExistingDoc(si, di, { documentTypeOther: e.target.value })} />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input !py-1 !text-xs" value={d.vendor} onChange={(e) => editExistingDoc(si, di, { vendor: e.target.value })}>
                      <option value="">No vendor yet</option>
                      {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
                    </select>
                    <select className="input !py-1 !text-xs" value={d.status} onChange={(e) => editExistingDoc(si, di, { status: e.target.value })}>
                      {DOC_STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div><label className="label">Vendor Rate</label><input type="number" className="input" value={d.vendorRate} onChange={(e) => editExistingDoc(si, di, { vendorRate: e.target.value })} /></div>
                    <div><label className="label">Vendor Adj (+/-)</label><input type="number" className="input" value={d.vendorAdjustment} onChange={(e) => editExistingDoc(si, di, { vendorAdjustment: e.target.value })} /></div>
                    <div><label className="label">Client Rate</label><input type="number" className="input" value={d.clientRate} onChange={(e) => editExistingDoc(si, di, { clientRate: e.target.value })} /></div>
                    <div><label className="label">Client Adj (+/-)</label><input type="number" className="input" value={d.clientAdjustment} onChange={(e) => editExistingDoc(si, di, { clientAdjustment: e.target.value })} /></div>
                  </div>
                </div>
              ))}
              {!sv.documents.length && <p className="text-xs text-slate-400">No documents on this service.</p>}
              <button type="button" className="text-xs text-brand-600 font-medium" onClick={() => addExistingDoc(si)}>+ Add a document to {sv.service}</button>
            </div>
          ))}
          {!editServices.length && <p className="text-xs text-slate-400">No services on this case.</p>}
          <p className="text-xs text-slate-400">Changes here save when you press "Update Case" below, together with the rest of the form.</p>
        </div>
      )}

      {/* PHASE 16 (Part A) — the new intake flow for every brand-new case.
          A client declares ALL the services their case needs up front,
          ticked from the fixed BOARD_TYPES list (+ "Other" free text) —
          Board Verification, IBCC, HEC, MOFA, Apostille, embassies,
          National Police Bureau. Each ticked service reveals its own
          document tick-list, filtered by DEFAULT_SERVICE_DOCTYPE_MAP (e.g.
          IBCC only offers Matric/Inter). Each ticked document gets its own
          Vendor + four rate fields — a document, even within the same
          service, can go to a different vendor and is tracked
          independently. IBCC gets one Normal/Urgent selector per
          service-entry (not per document). */}
      {!isEdit && (
        <div className="space-y-3">
          <label className="label mb-0">Services this case needs (tick all that apply — the full chain, if known up front)</label>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-50 border border-slate-100 p-3">
            {boardTypes.map((bt) => {
              const checked = serviceRows.some((r) => r.service === bt && !r.isOther);
              return (
                <label key={bt} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={checked} onChange={(e) => toggleServiceType(bt, e.target.checked)} />
                  {bt}
                </label>
              );
            })}
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={serviceRows.some((r) => r.isOther)} onChange={(e) => toggleOtherService(e.target.checked)} />
              Other
            </label>
          </div>
          {serviceRows.some((r) => r.isOther) && (
            <input className="input" placeholder="Type a service name" value={otherServiceName} onChange={(e) => updateOtherServiceName(e.target.value)} />
          )}

          {!serviceRows.length && <p className="text-xs text-slate-400">No services ticked yet — tick one above to start (e.g. Board Verification, IBCC, HEC, MOFA, UAE Embassy…).</p>}

          {serviceRows.map((row, si) => (
            <div key={si} className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm">{row.service || '(untitled service)'}</div>
                {row.service === 'IBCC' && (
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`urgency-${si}`} checked={row.urgency !== 'Urgent'} onChange={() => setServiceUrgency(si, 'Normal')} /> Normal
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`urgency-${si}`} checked={row.urgency === 'Urgent'} onChange={() => setServiceUrgency(si, 'Urgent')} /> Urgent
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500 uppercase">Documents for this service (tick all that apply — each gets its own vendor)</div>
                <ServiceDocumentTickList
                  docTypes={allowedDocTypesForService(row.service)}
                  documents={row.documents}
                  vendors={vendors}
                  onToggle={(name, checked) => toggleServiceDocument(si, name, checked)}
                  onAddOther={() => addServiceOtherDocument(si)}
                  onRemove={(di) => removeServiceDocument(si, di)}
                  onFieldChange={(di, patch) => setServiceDocumentField(si, di, patch)}
                />
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-400">Each document starts at status "Document Received" and is tracked independently — set its vendor/status/dates later from the Cases list (bulk actions work across services too).</p>
        </div>
      )}

      {/* --- Legacy MULTIPLE-board mode: kept for reference only, no longer
          reachable for a new case (the intake flow above replaces it), but
          the code stays in case an old draft/bookmark still points here. --- */}
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
                  onAddOther={() => addBoardOtherDocument(bi)}
                  onRemove={(di) => removeBoardDocument(bi, di)}
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
