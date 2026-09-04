'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { getCurrentUser } from '../lib/auth';

const STATUS_OPTIONS = ['New', 'Documents Received', 'Processing', 'Sent to Vendor', 'Pending', 'Completed', 'Returned to Client', 'Cancelled'];

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
    ...initial,
  }));

  const [baseRate, setBaseRate] = useState(0);

  // --- "Multiple" (board) mode state — point 7/9 ---
  const [selectedBoards, setSelectedBoards] = useState([]); // list of board names checked
  const [boardData, setBoardData] = useState({}); // board name -> { documentType, vendor, vendorRate, vendorAdjustment, clientRate, clientAdjustment }

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [inlineName, setInlineName] = useState('');

  useEffect(() => {
    Promise.all([api.getClients(), api.getVendors(), api.getServices(), api.getDocumentTypes(), api.getBoardTypes()])
      .then(([c, v, s, dt, bt]) => {
        setClients(c); setVendors(v); setServices(s); setDocTypes(dt); setBoardTypes(bt.boards || []);
      }).catch((e) => toast.error(e.message));
  }, []);

  const isMultiple = form.Case_Mode === 'multiple';
  const isConsultant = form.Client_Type === 'Consultant';
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

  const profit = useMemo(() => {
    if (isMultiple) {
      const vp = selectedBoards.reduce((s, b) => s + Number(boardData[b]?.vendorRate || 0) + Number(boardData[b]?.vendorAdjustment || 0), 0);
      const cp = selectedBoards.reduce((s, b) => s + Number(boardData[b]?.clientRate || 0) + Number(boardData[b]?.clientAdjustment || 0), 0);
      return cp - vp;
    }
    return (Number(form.Client_Payment) || 0) - (Number(form.Vendor_Payment) || 0);
  }, [isMultiple, selectedBoards, boardData, form.Client_Payment, form.Vendor_Payment]);

  function toggleBoard(name) {
    setSelectedBoards((prev) => {
      if (prev.includes(name)) return prev.filter((b) => b !== name);
      // seed default per-board state
      setBoardData((d) => ({ ...d, [name]: d[name] || { documentType: '', vendor: '', vendorRate: 0, vendorAdjustment: 0, clientRate: 0, clientAdjustment: 0 } }));
      return [...prev, name];
    });
  }

  function setBoard(name, k, v) {
    setBoardData((d) => ({ ...d, [name]: { ...d[name], [k]: v } }));
  }

  // Auto-fetch rates per board as vendor / consultant is picked.
  function onBoardVendorChange(board, vendorName) {
    setBoard(board, 'vendor', vendorName);
    if (!vendorName) return;
    api.getServiceRates({ service: board, vendor: vendorName }).then((rates) => {
      const r = rates && rates[0];
      setBoard(board, 'vendorRate', r ? Number(r.Rate) : 0);
    }).catch(() => {});
  }

  useEffect(() => {
    if (!isConsultant || !isMultiple || !form.Client_Name) return;
    selectedBoards.forEach((board) => {
      api.getConsultantRates({ consultant: form.Client_Name, board }).then((rates) => {
        const r = rates && rates[0];
        if (r) setBoard(board, 'clientRate', Number(r.Rate));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConsultant, isMultiple, form.Client_Name, selectedBoards.join(',')]);

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

  async function submit(e) {
    e.preventDefault();
    if (!form.Client_Name) return toast.error('Client name is required');
    if (isMultiple && !selectedBoards.length) return toast.error('Select at least one board');
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
        await api.updateCase({ ...payload, Case_ID: initial.Case_ID });
        toast.success('Case updated');
      } else if (isMultiple) {
        const Boards = selectedBoards.map((b) => ({
          Board_Name: b,
          Document_Type: boardData[b]?.documentType || '',
          Vendor: boardData[b]?.vendor || '',
          Vendor_Rate: boardData[b]?.vendorRate || 0,
          Vendor_Adjustment: boardData[b]?.vendorAdjustment || 0,
          Client_Rate: boardData[b]?.clientRate || 0,
          Client_Adjustment: boardData[b]?.clientAdjustment || 0,
        }));
        await api.addCase({ ...payload, Case_Mode: 'multiple', Boards });
        // Remember any edited rates for next time (points 5 & 6).
        Boards.forEach((b) => {
          if (isConsultant && b.Vendor) api.upsertConsultantRate({ Consultant_Name: form.Client_Name, Board_Name: b.Board_Name, Rate: b.Client_Rate }).catch(() => {});
          if (b.Vendor) api.upsertServiceRate({ Vendor_Name: b.Vendor, Service_Name: b.Board_Name, Rate: b.Vendor_Rate }).catch(() => {});
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
            </div>
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

      {/* --- MULTIPLE mode: point 9, independent per-board vendor/rate --- */}
      {isMultiple && !isEdit && (
        <div className="space-y-3">
          <label className="label">Boards / Documents to process</label>
          <div className="grid grid-cols-3 gap-2">
            {boardTypes.map((b) => (
              <label key={b} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer ${selectedBoards.includes(b) ? 'bg-brand-50 border-brand-300' : 'border-slate-200'}`}>
                <input type="checkbox" checked={selectedBoards.includes(b)} onChange={() => toggleBoard(b)} />
                {b}
              </label>
            ))}
          </div>

          {selectedBoards.map((b) => (
            <div key={b} className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-700">{b}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Document Type</label>
                  <select className="input" value={boardData[b]?.documentType || ''} onChange={(e) => setBoard(b, 'documentType', e.target.value)}>
                    <option value="">Select document type</option>
                    {docTypes.map((dt) => <option key={dt.Type_ID} value={dt.Name}>{dt.Category} — {dt.Name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Vendor for {b}</label>
                  <select className="input" value={boardData[b]?.vendor || ''} onChange={(e) => onBoardVendorChange(b, e.target.value)}>
                    <option value="">Select vendor</option>
                    {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="label">Vendor Rate</label>
                  <input type="number" className="input" value={boardData[b]?.vendorRate || 0} onChange={(e) => setBoard(b, 'vendorRate', e.target.value)} />
                </div>
                <div>
                  <label className="label">Vendor Adj (+/-)</label>
                  <input type="number" className="input" value={boardData[b]?.vendorAdjustment || 0} onChange={(e) => setBoard(b, 'vendorAdjustment', e.target.value)} />
                </div>
                <div>
                  <label className="label">Client Rate {isConsultant ? <span className="text-xs text-slate-400">(auto)</span> : ''}</label>
                  <input type="number" className="input" value={boardData[b]?.clientRate || 0} onChange={(e) => setBoard(b, 'clientRate', e.target.value)} />
                </div>
                <div>
                  <label className="label">Client Adj (+/-)</label>
                  <input type="number" className="input" value={boardData[b]?.clientAdjustment || 0} onChange={(e) => setBoard(b, 'clientAdjustment', e.target.value)} />
                </div>
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
